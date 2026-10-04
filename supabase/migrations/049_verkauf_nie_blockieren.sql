-- =============================================================================
-- Migration 049 – Verkauf nie am Bestand blockieren
--
-- create_pos_sale() wurde in Migration 048 schon umgestellt: ein knapper oder
-- fehlender Bestand ist kein Abbruchgrund mehr, der Verkauf wird gebucht, als
-- wäre die Ware da. create_order() (Checkout des Kunden) und
-- create_admin_order() (Rechnung/Bestellung aus dem Katalog, über den Admin
-- angelegt) prüften bislang noch denselben freien Bestand und lehnten mit
-- "Von X sind nur noch Y Stück verfügbar." ab – derselbe Fehler, den 048 für
-- die Kasse schon abgeschafft hat, nur an zwei weiteren Stellen.
--
-- create_order(): Prüfung ersatzlos raus. Reserviert wird weiter per
-- stock_reserved + Menge, das kennt ohnehin keine Obergrenze.
--
-- create_admin_order(): Prüfung raus, und das abschließende UPDATE bekommt
-- dieselbe Bremse wie create_pos_sale() – GREATEST(..., 0) – weil hier
-- tatsächlich abgebucht wird (stock_available) und die Spalte laut
-- CHECK-Constraint nicht negativ werden darf.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_order – unverändert bis auf die entfernte Bestandsprüfung. Signatur
-- identisch zu Migration 037, CREATE OR REPLACE ersetzt also an Ort und Stelle.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(
  p_items            JSONB,
  p_notes            TEXT        DEFAULT NULL,
  p_delivery_address TEXT        DEFAULT NULL,
  p_delivery_method  TEXT        DEFAULT 'shipping',
  p_payment_method   TEXT        DEFAULT 'transfer',
  p_pickup_at        TIMESTAMPTZ DEFAULT NULL,
  p_delivery_name    TEXT        DEFAULT NULL,
  p_delivery_street  TEXT        DEFAULT NULL,
  p_delivery_zip     TEXT        DEFAULT NULL,
  p_delivery_city    TEXT        DEFAULT NULL,
  p_delivery_country TEXT        DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_order      public.orders;
  v_product    public.products;
  v_tier       public.product_variants;
  v_row        RECORD;
  v_sub        NUMERIC(12, 2);
  v_total      NUMERIC(12, 2) := 0;
  v_vat        NUMERIC(5, 2);
  v_fruehester TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;

  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Dieses Konto ist deaktiviert.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Der Warenkorb ist leer.';
  END IF;

  IF p_delivery_method NOT IN ('pickup', 'shipping') THEN
    RAISE EXCEPTION 'Ungültige Versandart.';
  END IF;

  IF p_payment_method NOT IN ('transfer', 'cash', 'card') THEN
    RAISE EXCEPTION 'Ungültige Zahlungsart.';
  END IF;

  IF p_payment_method <> 'transfer' AND p_delivery_method <> 'pickup' THEN
    RAISE EXCEPTION 'Bar- und Kartenzahlung gibt es nur bei Selbstabholung.';
  END IF;

  IF p_delivery_method = 'pickup' AND p_pickup_at IS NOT NULL THEN
    v_fruehester := ((public.pos_heute() + 1) + TIME '08:00') AT TIME ZONE public.pos_zeitzone();
    IF p_pickup_at < v_fruehester THEN
      RAISE EXCEPTION 'Der Abholtermin muss frühestens morgen 08:00 Uhr liegen.';
    END IF;
  END IF;

  SELECT COALESCE(pos_vat_rate, 19) INTO v_vat
  FROM public.company_settings
  WHERE id;
  v_vat := COALESCE(v_vat, 19);

  INSERT INTO public.orders (
    customer_id, status, notes, delivery_address, delivery_method,
    payment_method, vat_rate, total_amount, pickup_at,
    delivery_name, delivery_street, delivery_zip, delivery_city, delivery_country
  )
  VALUES (
    auth.uid(),
    'submitted',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    p_delivery_method,
    p_payment_method,
    v_vat,
    0,
    CASE WHEN p_delivery_method = 'pickup' THEN p_pickup_at END,
    CASE WHEN p_delivery_method = 'shipping'
      THEN NULLIF(btrim(COALESCE(p_delivery_name, '')), '') END,
    CASE WHEN p_delivery_method = 'shipping'
      THEN NULLIF(btrim(COALESCE(p_delivery_street, '')), '') END,
    CASE WHEN p_delivery_method = 'shipping'
      THEN NULLIF(btrim(COALESCE(p_delivery_zip, '')), '') END,
    CASE WHEN p_delivery_method = 'shipping'
      THEN NULLIF(btrim(COALESCE(p_delivery_city, '')), '') END,
    CASE WHEN p_delivery_method = 'shipping'
      THEN NULLIF(btrim(COALESCE(p_delivery_country, '')), '') END
  )
  RETURNING * INTO v_order;

  FOR v_row IN
    SELECT (item ->> 'product_id')::UUID   AS product_id,
           SUM((item ->> 'quantity')::INT) AS quantity
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY 1
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_row.product_id AND is_active
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artikel ist nicht mehr verfügbar.';
    END IF;

    -- Kein Abbruch mehr bei knappem oder fehlendem Bestand (vorher: RAISE
    -- EXCEPTION "Von X sind nur noch Y Stück verfügbar."): wie an der Kasse
    -- (Migration 048) wird bestellt, als wäre die Ware da. stock_reserved
    -- kennt keine Obergrenze zu stock_available – die Differenz ist dieselbe
    -- "kein Bestand, trotzdem verkauft"-Lage wie am Tresen.
    SELECT * INTO v_tier
    FROM public.product_variants
    WHERE product_id = v_product.id
      AND min_quantity <= v_row.quantity
    ORDER BY min_quantity DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mindestbestellmenge für "%" nicht erreicht.',
        v_product.name;
    END IF;

    v_sub := ROUND(v_tier.unit_price * v_row.quantity, 2);
    v_total := v_total + v_sub;

    INSERT INTO public.order_items (
      order_id, product_variant_id, product_name, product_sku,
      quantity, unit_price, subtotal
    )
    VALUES (
      v_order.id, v_tier.id, v_product.name, v_product.sku,
      v_row.quantity, v_tier.unit_price, v_sub
    );

    UPDATE public.products
    SET stock_reserved = stock_reserved + v_row.quantity
    WHERE id = v_product.id;
  END LOOP;

  UPDATE public.orders
  SET total_amount = v_total
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- create_admin_order – Prüfung raus, Abbuchung geklemmt. Signatur identisch
-- zu Migration 023.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_admin_order(
  p_customer_id      UUID,
  p_items            JSONB,
  p_notes            TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_method  TEXT DEFAULT 'pickup'
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

    -- Zeilensperre bleibt: zwischen Lesen und Schreiben darf keine parallele
    -- Bestellung oder ein Kassenverkauf dazwischenfunken.
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

    -- Kein Abbruch mehr bei knappem oder fehlendem Bestand (vorher: RAISE
    -- EXCEPTION "Von X sind nur noch Y Stück verfügbar."). Abgebucht wird wie
    -- bisher sofort (anders als create_order, das nur reserviert) – aber
    -- geklemmt bei 0, wie an der Kasse (Migration 048): stock_available darf
    -- laut CHECK-Constraint nicht negativ werden.
    UPDATE public.products
    SET stock_available = GREATEST(stock_available - v_row.quantity, 0)
    WHERE id = v_product.id;
  END LOOP;

  UPDATE public.orders
  SET total_amount = v_total
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
