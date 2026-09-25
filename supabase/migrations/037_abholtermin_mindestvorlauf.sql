-- =============================================================================
-- Migration 037 – Mindestvorlauf für den Abholtermin serverseitig erzwingen
--
-- "Frühestens morgen 08:00" stand bisher nur als HTML-min-Attribut im
-- Checkout-Formular (fruehesterTermin() in components/forms/checkout-form.tsx).
-- Ein direkt abgesetzter Request (oder deaktiviertes JavaScript) konnte einen
-- Abholtermin in wenigen Minuten setzen – create_order() prüfte bislang nur
-- "nicht in der Vergangenheit". Die Regel gehört an dieselbe Stelle wie die
-- übrige Validierung: in die Datenbankfunktion.
--
-- Die Grenze folgt der Ladenzeit (Europe/Berlin), nicht UTC – wie beim
-- Tagesabschluss über pos_heute()/pos_zeitzone() (Migration 025).
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

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
  v_free       INT;
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

  -- Steuersatz aus den Firmendaten festschreiben. Fehlt die Zeile (Migration
  -- 016 noch nicht eingespielt), bleibt es beim Regelsteuersatz.
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
    -- Bei Abholung wird keine Lieferanschrift gespeichert, auch wenn das
    -- Formular vorher ausgefüllt und dann umgeschaltet wurde.
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

    v_free := GREATEST(v_product.stock_available - v_product.stock_reserved, 0);
    IF v_row.quantity > v_free THEN
      RAISE EXCEPTION 'Von "%" sind nur noch % Stück verfügbar.',
        v_product.name, v_free;
    END IF;

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
