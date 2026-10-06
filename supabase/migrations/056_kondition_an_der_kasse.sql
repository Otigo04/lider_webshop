-- =============================================================================
-- 056 – Sonderkondition auch an der Kasse und bei Rechnungen aus dem Katalog
--
-- Migration 054 hat die Sonderkondition (customer_conditions) im Shop
-- eingeführt. Hier gilt sie zusätzlich:
--
-- 1. create_pos_sale(): Verkauf auf ein Händlerkonto. Abgezogen wird auf die
--    Katalogartikel, nicht auf freie Positionen (Pfand, Dienstleistung,
--    Ware ohne Stamm) – dort hat der Kassierer den Preis gerade selbst
--    getippt, und 10 % auf Palettenpfand wären kein Rabatt, sondern ein
--    Fehler. Neue Spalten an pos_sales halten Warenwert, Satz und Abzug fest.
-- 2. create_admin_order(): Bestellung, die der Admin für einen Kunden anlegt
--    (/kasse/rechnungen/new, „Aus Katalog"). Abzug auf den Warenwert wie im
--    Shop, Snapshot in denselben Spalten wie Migration 054.
--
-- Beide Funktionen bekommen p_apply_condition (Vorgabe true): an der Kasse
-- lässt sich die Kondition für einen einzelnen Vorgang abschalten, etwa wenn
-- schon ein Sonderpreis getippt wurde.
--
-- Reihenfolge und Rundung wie lib/rabatt.ts: Abzug = ROUND(Basis × Satz/100, 2),
-- danach erst die Steuer.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS subtotal_amount           NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS customer_discount_percent NUMERIC(5, 2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_discount_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_sales.subtotal_amount IS
  'Summe der Positionen vor der Sonderkondition, in der Preislesart des Verkaufs. NULL vor Migration 056.';
COMMENT ON COLUMN public.pos_sales.customer_discount_amount IS
  'Abzug der Sonderkondition auf die Katalogartikel, in der Preislesart des Verkaufs.';

-- -----------------------------------------------------------------------------
-- 1. create_pos_sale
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_pos_sale(JSONB, UUID, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC);

CREATE OR REPLACE FUNCTION public.create_pos_sale(
  p_items           JSONB,
  p_customer_id     UUID    DEFAULT NULL,
  p_customer_label  TEXT    DEFAULT NULL,
  p_payment_method  TEXT    DEFAULT 'cash',
  p_note            TEXT    DEFAULT NULL,
  p_prices_gross    BOOLEAN DEFAULT NULL,
  p_vat_rate        NUMERIC DEFAULT NULL,
  p_apply_condition BOOLEAN DEFAULT true
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale     public.pos_sales;
  v_settings public.company_settings;
  v_row      RECORD;
  v_product  public.products;
  v_gross    BOOLEAN;
  v_rate     NUMERIC(4, 2);
  v_sub      NUMERIC(12, 2);
  v_summe    NUMERIC(12, 2) := 0;   -- Summe der Positionen in der Eingabelesart
  v_artikel  NUMERIC(12, 2) := 0;   -- davon Katalogartikel
  v_satz     NUMERIC(5, 2)  := 0;
  v_abzug    NUMERIC(12, 2) := 0;
  v_basis    NUMERIC(12, 2);
  v_net      NUMERIC(12, 2);
  v_vat      NUMERIC(12, 2);
  v_total    NUMERIC(12, 2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Der Bon ist leer.';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'Unbekannte Zahlart.';
  END IF;

  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  SELECT * INTO v_settings FROM public.company_settings WHERE id;

  v_rate  := COALESCE(p_vat_rate, v_settings.pos_vat_rate, 19);
  v_gross := COALESCE(p_prices_gross, v_settings.pos_prices_gross, true);

  IF v_rate NOT IN (0, 7, 19) THEN
    RAISE EXCEPTION 'Ungültiger Steuersatz.';
  END IF;

  INSERT INTO public.pos_sales (
    customer_id, customer_label, cashier_id, payment_method,
    vat_rate, net_amount, vat_amount, total_amount, note
  )
  VALUES (
    p_customer_id,
    NULLIF(btrim(COALESCE(p_customer_label, '')), ''),
    auth.uid(),
    p_payment_method,
    v_rate, 0, 0, 0,
    NULLIF(btrim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_sale;

  FOR v_row IN
    SELECT NULLIF(item ->> 'product_id', '')::UUID AS product_id,
           item ->> 'name'                         AS name,
           item ->> 'sku'                          AS sku,
           NULLIF(item ->> 'barcode', '')          AS barcode,
           (item ->> 'quantity')::INT              AS quantity,
           (item ->> 'unit_price')::NUMERIC        AS unit_price
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;
    IF v_row.unit_price IS NULL OR v_row.unit_price < 0 THEN
      RAISE EXCEPTION 'Ungültiger Preis.';
    END IF;

    IF v_row.product_id IS NOT NULL THEN
      SELECT * INTO v_product
      FROM public.products
      WHERE id = v_row.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Artikel nicht gefunden.';
      END IF;

      -- Wie Migration 048: kein Abbruch bei knappem Bestand, geklemmt bei 0.
      UPDATE public.products
      SET stock_available = GREATEST(stock_available - v_row.quantity, 0)
      WHERE id = v_product.id;
    ELSE
      v_product := NULL;
    END IF;

    v_sub   := ROUND(v_row.unit_price * v_row.quantity, 2);
    v_summe := v_summe + v_sub;
    IF v_row.product_id IS NOT NULL THEN
      v_artikel := v_artikel + v_sub;
    END IF;

    INSERT INTO public.pos_sale_items (
      sale_id, product_id, product_name, product_sku, barcode,
      quantity, unit_price, subtotal
    )
    VALUES (
      v_sale.id,
      v_row.product_id,
      COALESCE(NULLIF(btrim(COALESCE(v_row.name, '')), ''), v_product.name, 'Position'),
      COALESCE(NULLIF(btrim(COALESCE(v_row.sku, '')), ''), v_product.sku, '—'),
      COALESCE(v_row.barcode, v_product.barcode),
      v_row.quantity,
      v_row.unit_price,
      v_sub
    );
  END LOOP;

  -- Sonderkondition auf die Katalogartikel (nur mit Händlerkonto)
  IF p_customer_id IS NOT NULL AND COALESCE(p_apply_condition, true) THEN
    SELECT discount_percent INTO v_satz
    FROM public.customer_conditions
    WHERE customer_id = p_customer_id;
    v_satz  := COALESCE(v_satz, 0);
    v_abzug := ROUND(v_artikel * v_satz / 100, 2);
  END IF;
  v_basis := v_summe - v_abzug;

  IF v_gross THEN
    -- Eingegebene Preise sind Endpreise: Steuer herausrechnen.
    v_total := ROUND(v_basis, 2);
    v_net   := ROUND(v_total / (1 + v_rate / 100), 2);
    v_vat   := ROUND(v_total - v_net, 2);
  ELSE
    v_net   := ROUND(v_basis, 2);
    v_vat   := ROUND(v_net * v_rate / 100, 2);
    v_total := ROUND(v_net + v_vat, 2);
  END IF;

  UPDATE public.pos_sales
  SET net_amount                = v_net,
      vat_amount                = v_vat,
      total_amount              = v_total,
      subtotal_amount           = v_summe,
      customer_discount_percent = CASE WHEN v_abzug > 0 THEN v_satz ELSE 0 END,
      customer_discount_amount  = v_abzug
  WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_sale(JSONB, UUID, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, UUID, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, BOOLEAN)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. create_admin_order
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT);

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
  v_order   public.orders;
  v_product public.products;
  v_tier    public.product_variants;
  v_row     RECORD;
  v_price   NUMERIC(10, 2);
  v_sub     NUMERIC(12, 2);
  v_total   NUMERIC(12, 2) := 0;
  v_satz    NUMERIC(5, 2)  := 0;
  v_abzug   NUMERIC(12, 2) := 0;
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
    SELECT (item ->> 'product_id')::UUID              AS product_id,
           (item ->> 'quantity')::INT                  AS quantity,
           NULLIF(item ->> 'unit_price', '')::NUMERIC   AS unit_price
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
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

    v_sub := ROUND(v_price * v_row.quantity, 2);
    v_total := v_total + v_sub;

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
    v_abzug := ROUND(v_total * v_satz / 100, 2);
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
