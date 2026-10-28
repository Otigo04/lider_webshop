-- =============================================================================
-- 079 – Eine Rechnung aus Katalog- und freien Positionen
--
-- „Neue Rechnung" kennt nur noch einen Weg: Bestellung + Rechnung. Eine Position
-- ist entweder ein Katalogartikel (wie bisher) oder eine freie Position, die
-- der Admin selbst eintippt, optional mit gescanntem Barcode.
--
-- 1. order_items.barcode: Strichcode einer freien Position, nur zur Anzeige und
--    fürs PDF („EAN …"); gerechnet wird damit nichts.
-- 2. create_admin_order() nimmt freie Positionen im selben JSON an:
--      Katalog: {"product_id": "…", "quantity": 2, "unit_price": 1.5 (optional)}
--      Frei:    {"description": "…", "quantity": 1, "unit_price": 9.9, "barcode": "…"}
--    Eine freie Position hat keine Variante (product_variant_id NULL, Name als
--    Snapshot) und bucht keinen Bestand. Die Sonderkondition gilt nur auf die
--    Katalogzeilen – wie an der Kasse (Migration 056). Alle Zeilen laufen mit dem
--    einen Steuersatz der Bestellung, die Steuer rechnet lib/vat.ts auf die Summe.
--
-- Wie Migration 056, geändert sind nur der Positionsblock und die Basis des
-- Rabatts. Signatur identisch, CREATE OR REPLACE ersetzt an Ort und Stelle.
-- Ältere Aufrufe (nur Katalog) laufen unverändert.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS barcode TEXT
  CHECK (barcode IS NULL OR char_length(barcode) <= 64);

COMMENT ON COLUMN public.order_items.barcode IS
  'Strichcode einer freien Position (Migration 079), nur Anzeige und PDF.';

CREATE OR REPLACE FUNCTION public.create_admin_order(
  p_customer_id      UUID,
  p_items            JSONB,
  p_notes            TEXT    DEFAULT NULL,
  p_delivery_address TEXT    DEFAULT NULL,
  p_delivery_method  TEXT    DEFAULT 'pickup',
  p_apply_condition  BOOLEAN DEFAULT true
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order     public.orders;
  v_product   public.products;
  v_tier      public.product_variants;
  v_row       RECORD;
  v_price     NUMERIC(10, 2);
  v_sub       NUMERIC(12, 2);
  v_total     NUMERIC(12, 2) := 0;   -- alle Positionen
  v_katalog   NUMERIC(12, 2) := 0;   -- davon Katalogartikel: darauf gilt die Kondition
  v_satz      NUMERIC(5, 2)  := 0;
  v_abzug     NUMERIC(12, 2) := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_customer_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keine Positionen angegeben.';
  END IF;

  INSERT INTO public.orders (
    customer_id, status, notes, delivery_address, delivery_method, total_amount
  )
  VALUES (
    p_customer_id,
    'confirmed',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    p_delivery_method,
    0
  )
  RETURNING * INTO v_order;

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

    -- Freie Position: kein Artikel, Name und Preis kommen vom Admin.
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
        v_order.id, NULL, v_row.description, '',
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

    v_tier := NULL;

    IF v_row.unit_price IS NOT NULL THEN
      v_price := v_row.unit_price;
    ELSE
      SELECT * INTO v_tier
      FROM public.product_variants
      WHERE product_id = v_product.id AND min_quantity <= v_row.quantity
      ORDER BY min_quantity DESC
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Kein Preis für "%" bei dieser Menge hinterlegt.',
          v_product.name;
      END IF;

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
      v_order.id, v_tier.id, v_product.name, v_product.sku,
      v_row.quantity, v_price, v_sub
    );

    -- Wie Migration 049: sofort abbuchen, geklemmt bei 0.
    UPDATE public.products
    SET stock_available = GREATEST(stock_available - v_row.quantity, 0)
    WHERE id = v_product.id;
  END LOOP;

  IF COALESCE(p_apply_condition, true) THEN
    SELECT discount_percent INTO v_satz
    FROM public.customer_conditions
    WHERE customer_id = p_customer_id;
    v_satz  := COALESCE(v_satz, 0);
    v_abzug := ROUND(v_katalog * v_satz / 100, 2);
  END IF;

  UPDATE public.orders
  SET subtotal_amount           = v_total,
      customer_discount_percent = CASE WHEN v_abzug > 0 THEN v_satz ELSE 0 END,
      customer_discount_amount  = v_abzug,
      total_amount              = v_total - v_abzug
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN)
  TO authenticated;
