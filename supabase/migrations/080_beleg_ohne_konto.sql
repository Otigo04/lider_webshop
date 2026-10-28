-- =============================================================================
-- 080 – Beleg für einen Kunden ohne Konto
--
-- „Neue Rechnung" (/kasse/rechnungen/new) kann Rechnung oder Lieferschein für
-- einen registrierten Kunden ODER für jemanden anlegen, der nur mit Namen (und
-- Anschrift) erfasst wird, ohne Registrierung.
--
-- 1. orders und invoices: customer_id wird nullable. Ohne Konto stehen Name und
--    Anschrift als Text an der Bestellung bzw. Rechnung (customer_label,
--    customer_street, customer_zip, customer_city) – ein Konto hat die
--    Bestellung dann nie. Mindestens eins von beidem muss da sein.
--    Ohne Konto sieht kein Kunde die Bestellung (RLS vergleicht customer_id mit
--    auth.uid(), NULL passt auf niemanden); der Admin sieht sie wie jede andere.
-- 2. create_admin_order() nimmt p_customer_id = NULL und stattdessen
--    p_customer_label an. Ohne Konto gibt es keine Sonderkondition.
-- 3. create_invoice_for_order() kopiert Kunde bzw. die Angaben ohne Konto an die
--    Rechnung.
--
-- Der Lieferschein hat keine eigene Nummer: es ist die Bestellnummer (LG-…),
-- wie bisher (docs/kasse.md). Ein Lieferschein ist also eine Bestellung ohne
-- Rechnung; die Rechnung lässt sich später aus der Bestellung erzeugen.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Spalten
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS customer_label  TEXT CHECK (customer_label  IS NULL OR char_length(customer_label)  <= 120),
  ADD COLUMN IF NOT EXISTS customer_street TEXT CHECK (customer_street IS NULL OR char_length(customer_street) <= 120),
  ADD COLUMN IF NOT EXISTS customer_zip    TEXT CHECK (customer_zip    IS NULL OR char_length(customer_zip)    <= 12),
  ADD COLUMN IF NOT EXISTS customer_city   TEXT CHECK (customer_city   IS NULL OR char_length(customer_city)   <= 80);

ALTER TABLE public.invoices
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS customer_label  TEXT CHECK (customer_label  IS NULL OR char_length(customer_label)  <= 120),
  ADD COLUMN IF NOT EXISTS customer_street TEXT CHECK (customer_street IS NULL OR char_length(customer_street) <= 120),
  ADD COLUMN IF NOT EXISTS customer_zip    TEXT CHECK (customer_zip    IS NULL OR char_length(customer_zip)    <= 12),
  ADD COLUMN IF NOT EXISTS customer_city   TEXT CHECK (customer_city   IS NULL OR char_length(customer_city)   <= 80);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_kunde_oder_name;
ALTER TABLE public.orders ADD CONSTRAINT orders_kunde_oder_name
  CHECK (customer_id IS NOT NULL OR NULLIF(btrim(customer_label), '') IS NOT NULL);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_kunde_oder_name;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_kunde_oder_name
  CHECK (customer_id IS NOT NULL OR NULLIF(btrim(customer_label), '') IS NOT NULL);

COMMENT ON COLUMN public.orders.customer_label IS
  'Name eines Kunden ohne Konto (Migration 080); NULL bei Bestellungen mit Konto.';

-- -----------------------------------------------------------------------------
-- 2. create_admin_order – wie Migration 079, dazu der Kunde ohne Konto.
--    Neue Parameter hinten mit Vorgabe. Die alte Signatur wird entfernt, sonst
--    stünden zwei Überladungen nebeneinander und ein Aufruf mit den bisherigen
--    sechs Parametern wäre für PostgREST nicht eindeutig.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN);

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
  v_label     TEXT := NULLIF(btrim(COALESCE(p_customer_label, '')), '');
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

  -- Sonderkondition gibt es nur mit Konto.
  IF p_customer_id IS NOT NULL AND COALESCE(p_apply_condition, true) THEN
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

REVOKE ALL ON FUNCTION public.create_admin_order(
  UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_order(
  UUID, JSONB, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. create_invoice_for_order – wie Migration 029, dazu Kunde ohne Konto.
--    Geändert: die Berechtigungsprüfung (NULL ≠ auth.uid() darf nicht
--    durchrutschen) und die Spalten der Rechnung.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invoice_for_order(p_order_id UUID)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_order   public.orders;
  v_invoice public.invoices;
  v_net     NUMERIC(12, 2);
  v_vat     NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden.';
  END IF;

  IF NOT public.is_admin() AND v_order.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Bestellung.';
  END IF;

  -- Schon eine Rechnung zur Bestellung? Dann diese zurückgeben. Eine gestellte
  -- Rechnung wird nie durch eine zweite ersetzt – die Nummer ist vergeben.
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE order_id = p_order_id;

  IF FOUND THEN
    RETURN v_invoice;
  END IF;

  v_net := v_order.total_amount;
  v_vat := ROUND(v_net * COALESCE(v_order.vat_rate, 0) / 100, 2);

  INSERT INTO public.invoices (
    order_id, customer_id, customer_label, customer_street, customer_zip,
    customer_city, type, net_amount, vat_amount, total_amount
  )
  VALUES (
    p_order_id, v_order.customer_id, v_order.customer_label,
    v_order.customer_street, v_order.customer_zip, v_order.customer_city,
    'order', v_net, v_vat, v_net + v_vat
  )
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$fn$;
