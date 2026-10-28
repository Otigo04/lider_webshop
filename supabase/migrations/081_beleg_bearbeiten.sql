-- =============================================================================
-- 081 – Rechnung und Lieferschein bearbeiten
--
-- Lieferschein (Bestellung ohne Rechnung): wird an Ort und Stelle geändert,
-- Nummer (LG-…) bleibt. update_admin_order() bucht den Bestand um die
-- Differenz: erst die alten Katalogmengen zurück, dann die neuen ab.
--
-- Rechnung: wird nie überschrieben. Der Admin stellt eine neue Rechnung
-- (neue Bestellung, create_admin_order) und storniert die alte (cancel_invoice,
-- Migration 064). Weil der Storno den Bestand nicht anfasst, bucht
-- restore_order_stock() die Mengen der alten Bestellung zurück – zusammen mit
-- dem Abbuchen der neuen bleibt netto die Differenz. Einmal je Bestellung
-- (orders.stock_restored_at), ein zweiter Aufruf bucht nichts.
--
-- Dazu: die Positionslogik von create_admin_order (Migration 080) steht jetzt in
-- admin_order_positionen(), damit Anlegen und Ändern dieselbe Buchung nutzen.
-- Neu darin: eine Katalogposition behält ihre Staffel (product_variant_id) auch
-- mit überschriebenem Preis – das Formular schickt den Preis immer mit, und die
-- Verknüpfung ging bisher verloren.
--
-- Der Bestand wird über die Artikelnummer der Position zurückgebucht
-- (order_items.product_sku, steht an jeder Katalogposition), nicht über die
-- Staffel: die Verknüpfung kann fehlen oder ins Leere zeigen.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- Positionen buchen (intern, nicht für Kunden aufrufbar)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_order_positionen(
  p_order_id UUID,
  p_items    JSONB
)
RETURNS TABLE (o_total NUMERIC, o_katalog NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.products;
  v_tier    public.product_variants;
  v_row     RECORD;
  v_price   NUMERIC(10, 2);
  v_sub     NUMERIC(12, 2);
  v_total   NUMERIC(12, 2) := 0;   -- alle Positionen
  v_katalog NUMERIC(12, 2) := 0;   -- davon Katalogartikel: darauf gilt die Kondition
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keine Positionen angegeben.';
  END IF;

  FOR v_row IN
    SELECT NULLIF(item ->> 'product_id', '')::UUID                    AS product_id,
           (item ->> 'quantity')::INT                                  AS quantity,
           NULLIF(item ->> 'unit_price', '')::NUMERIC                  AS unit_price,
           NULLIF(btrim(COALESCE(item ->> 'description', '')), '')     AS description,
           NULLIF(btrim(COALESCE(item ->> 'barcode', '')), '')         AS barcode
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;

    -- Freie Position: kein Artikel, Name und Preis kommen vom Admin. Der Preis
    -- darf 0 sein (Lieferschein ohne Preise).
    IF v_row.product_id IS NULL THEN
      IF v_row.description IS NULL THEN
        RAISE EXCEPTION 'Bei einer freien Position fehlt die Beschreibung.';
      END IF;
      IF char_length(v_row.description) > 500 THEN
        RAISE EXCEPTION 'Die Beschreibung ist zu lang.';
      END IF;
      IF v_row.unit_price IS NULL OR v_row.unit_price < 0 THEN
        RAISE EXCEPTION 'Bei einer freien Position fehlt der Preis.';
      END IF;
      IF v_row.barcode IS NOT NULL AND char_length(v_row.barcode) > 64 THEN
        RAISE EXCEPTION 'Der Barcode ist zu lang.';
      END IF;

      v_sub   := ROUND(v_row.unit_price * v_row.quantity, 2);
      v_total := v_total + v_sub;

      INSERT INTO public.order_items (
        order_id, product_variant_id, product_name, product_sku,
        quantity, unit_price, subtotal, barcode
      )
      VALUES (
        p_order_id, NULL, v_row.description, '',
        v_row.quantity, v_row.unit_price, v_sub, v_row.barcode
      );

      CONTINUE;
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_row.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artikel nicht gefunden.';
    END IF;

    -- Die Staffel zur Menge, auch wenn der Preis überschrieben wird: sie bleibt
    -- als Verknüpfung an der Position.
    SELECT * INTO v_tier
    FROM public.product_variants
    WHERE product_id = v_product.id AND min_quantity <= v_row.quantity
    ORDER BY min_quantity DESC
    LIMIT 1;

    IF v_row.unit_price IS NOT NULL THEN
      v_price := v_row.unit_price;
    ELSIF v_tier.id IS NULL THEN
      RAISE EXCEPTION 'Kein Preis für "%" bei dieser Menge hinterlegt.',
        v_product.name;
    ELSE
      v_price := v_tier.unit_price;
    END IF;

    v_sub     := ROUND(v_price * v_row.quantity, 2);
    v_total   := v_total + v_sub;
    v_katalog := v_katalog + v_sub;

    INSERT INTO public.order_items (
      order_id, product_variant_id, product_name, product_sku,
      quantity, unit_price, subtotal
    )
    VALUES (
      p_order_id, v_tier.id, v_product.name, v_product.sku,
      v_row.quantity, v_price, v_sub
    );

    -- Wie Migration 049: sofort abbuchen, geklemmt bei 0.
    UPDATE public.products
    SET stock_available = GREATEST(stock_available - v_row.quantity, 0)
    WHERE id = v_product.id;
  END LOOP;

  o_total := v_total;
  o_katalog := v_katalog;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_order_positionen(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Bestand der Positionen einer Bestellung zurückbuchen (intern)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_bestand_zurueck(p_order_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.products p
  SET stock_available = p.stock_available + s.menge
  FROM (
    SELECT oi.product_sku, SUM(oi.quantity) AS menge
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.product_sku <> ''
    GROUP BY oi.product_sku
  ) s
  WHERE p.sku = s.product_sku;
$$;

REVOKE ALL ON FUNCTION public.order_bestand_zurueck(UUID)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_admin_order – wie Migration 080, die Positionen kommen aus
-- admin_order_positionen(). Signatur unverändert.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_admin_order(
  p_customer_id      UUID,
  p_items            JSONB,
  p_notes            TEXT    DEFAULT NULL,
  p_delivery_address TEXT    DEFAULT NULL,
  p_delivery_method  TEXT    DEFAULT 'pickup',
  p_apply_condition  BOOLEAN DEFAULT true,
  p_customer_label   TEXT    DEFAULT NULL,
  p_customer_street  TEXT    DEFAULT NULL,
  p_customer_zip     TEXT    DEFAULT NULL,
  p_customer_city    TEXT    DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order  public.orders;
  v_summen RECORD;
  v_satz   NUMERIC(5, 2)  := 0;
  v_abzug  NUMERIC(12, 2) := 0;
  v_label  TEXT := NULLIF(btrim(COALESCE(p_customer_label, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users WHERE id = p_customer_id AND role = 'customer'
    ) THEN
      RAISE EXCEPTION 'Kunde nicht gefunden.';
    END IF;
    v_label := NULL;
  ELSIF v_label IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Kunden wählen oder einen Namen angeben.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keine Positionen angegeben.';
  END IF;

  INSERT INTO public.orders (
    customer_id, customer_label, customer_street, customer_zip, customer_city,
    status, notes, delivery_address, delivery_method, total_amount
  )
  VALUES (
    p_customer_id,
    v_label,
    CASE WHEN v_label IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(p_customer_street, '')), '') END,
    CASE WHEN v_label IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(p_customer_zip, '')), '') END,
    CASE WHEN v_label IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(p_customer_city, '')), '') END,
    'confirmed',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    p_delivery_method,
    0
  )
  RETURNING * INTO v_order;

  SELECT * INTO v_summen FROM public.admin_order_positionen(v_order.id, p_items);

  -- Sonderkondition gibt es nur mit Konto.
  IF p_customer_id IS NOT NULL AND COALESCE(p_apply_condition, true) THEN
    SELECT discount_percent INTO v_satz
    FROM public.customer_conditions
    WHERE customer_id = p_customer_id;
    v_satz  := COALESCE(v_satz, 0);
    v_abzug := ROUND(v_summen.o_katalog * v_satz / 100, 2);
  END IF;

  UPDATE public.orders
  SET subtotal_amount           = v_summen.o_total,
      customer_discount_percent = CASE WHEN v_abzug > 0 THEN v_satz ELSE 0 END,
      customer_discount_amount  = v_abzug,
      total_amount              = v_summen.o_total - v_abzug
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- -----------------------------------------------------------------------------
-- update_admin_order – Lieferschein (Bestellung ohne Rechnung) ändern.
-- Der Kunde bleibt; bei einem Beleg ohne Konto sind Name und Anschrift
-- änderbar. Hat die Bestellung eine Rechnung, wird nichts überschrieben.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_admin_order(
  p_order_id         UUID,
  p_items            JSONB,
  p_notes            TEXT    DEFAULT NULL,
  p_delivery_address TEXT    DEFAULT NULL,
  p_delivery_method  TEXT    DEFAULT 'pickup',
  p_apply_condition  BOOLEAN DEFAULT true,
  p_customer_label   TEXT    DEFAULT NULL,
  p_customer_street  TEXT    DEFAULT NULL,
  p_customer_zip     TEXT    DEFAULT NULL,
  p_customer_city    TEXT    DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order  public.orders;
  v_summen RECORD;
  v_satz   NUMERIC(5, 2)  := 0;
  v_abzug  NUMERIC(12, 2) := 0;
  v_label  TEXT := NULLIF(btrim(COALESCE(p_customer_label, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden.';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Die Bestellung ist storniert und lässt sich nicht ändern.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices WHERE order_id = p_order_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Zu dieser Bestellung gibt es eine Rechnung. Eine Rechnung wird nicht überschrieben, sondern storniert und neu gestellt.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keine Positionen angegeben.';
  END IF;
  IF v_order.customer_id IS NULL AND v_label IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Namen angeben.';
  END IF;

  -- Erst die alten Katalogmengen zurück, dann die neuen ab: netto die Differenz.
  PERFORM public.order_bestand_zurueck(p_order_id);
  DELETE FROM public.order_items WHERE order_id = p_order_id;

  SELECT * INTO v_summen FROM public.admin_order_positionen(p_order_id, p_items);

  IF v_order.customer_id IS NOT NULL AND COALESCE(p_apply_condition, true) THEN
    SELECT discount_percent INTO v_satz
    FROM public.customer_conditions
    WHERE customer_id = v_order.customer_id;
    v_satz  := COALESCE(v_satz, 0);
    v_abzug := ROUND(v_summen.o_katalog * v_satz / 100, 2);
  END IF;

  UPDATE public.orders
  SET notes                     = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      delivery_address          = NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
      delivery_method           = p_delivery_method,
      customer_label            = CASE WHEN customer_id IS NULL THEN v_label ELSE customer_label END,
      customer_street           = CASE WHEN customer_id IS NULL THEN NULLIF(btrim(COALESCE(p_customer_street, '')), '') ELSE customer_street END,
      customer_zip              = CASE WHEN customer_id IS NULL THEN NULLIF(btrim(COALESCE(p_customer_zip, '')), '') ELSE customer_zip END,
      customer_city             = CASE WHEN customer_id IS NULL THEN NULLIF(btrim(COALESCE(p_customer_city, '')), '') ELSE customer_city END,
      subtotal_amount           = v_summen.o_total,
      customer_discount_percent = CASE WHEN v_abzug > 0 THEN v_satz ELSE 0 END,
      customer_discount_amount  = v_abzug,
      total_amount              = v_summen.o_total - v_abzug
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.update_admin_order(
  UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_order(
  UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- -----------------------------------------------------------------------------
-- restore_order_stock – nach dem Storno einer ersetzten Rechnung: Bestand der
-- alten Bestellung zurück. Einmal je Bestellung, nur für stornierte.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden.';
  END IF;
  IF v_order.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Nur der Bestand einer stornierten Bestellung wird zurückgebucht.';
  END IF;
  IF v_order.stock_restored_at IS NOT NULL THEN
    RETURN false;
  END IF;

  PERFORM public.order_bestand_zurueck(p_order_id);
  UPDATE public.orders SET stock_restored_at = now() WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_order_stock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(UUID) TO authenticated;
