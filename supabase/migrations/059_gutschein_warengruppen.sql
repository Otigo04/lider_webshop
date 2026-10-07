-- =============================================================================
-- 059 – Gutscheine auf Warengruppen beschränken
--
-- Ein Gutschein kann optional nur für bestimmte Warengruppen gelten
-- („BATTERIEN10" nur auf Batterien). Ohne Auswahl gilt er wie bisher für den
-- ganzen Warenkorb.
--
-- 1. vouchers.category_ids: Liste der Warengruppen, leer = alle. Bewusst ein
--    Feld und keine Verknüpfungstabelle mit ON DELETE CASCADE: wird eine
--    Warengruppe gelöscht, bliebe sonst ein Gutschein ohne Einschränkung
--    übrig und gälte plötzlich für alles. So gilt er im schlimmsten Fall für
--    nichts mehr – das fällt auf und kostet kein Geld.
-- 2. gutschein_abfragen() gibt zusätzlich die Namen der Warengruppen heraus
--    und, welche Artikel des Warenkorbs darunter fallen. Der Warenkorb im
--    Browser kennt die Warengruppe seiner Artikel nicht.
-- 3. create_order() rechnet den Gutschein nur auf den Warenwert dieser
--    Artikel. Reihenfolge und Rundung wie lib/rabatt.ts:
--      Anteil    = Summe der Positionen aus den Warengruppen
--      Basis     = Anteil − ROUND(Anteil × Sonderkondition / 100, 2),
--                  höchstens der Rest der Bestellung nach der Kondition
--      Prozent   = ROUND(Basis × Wert / 100, 2)
--      fest      = höchstens die Basis
--    Der Mindestbestellwert gilt gegen den Anteil. Ohne Einschränkung ist
--    der Anteil der ganze Warenwert – dann ändert sich gegenüber 054 nichts.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS category_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.vouchers.category_ids IS
  'Warengruppen, für die der Gutschein gilt. Leer = alle (Migration 059).';

-- -----------------------------------------------------------------------------
-- 1. Vorschau im Bestellformular
--
--    Neuer Parameter p_product_ids. Die alte Signatur wird entfernt, sonst
--    stünden zwei Überladungen nebeneinander und PostgREST könnte einen
--    Aufruf nur mit p_code nicht eindeutig zuordnen.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.gutschein_abfragen(TEXT);

CREATE OR REPLACE FUNCTION public.gutschein_abfragen(
  p_code        TEXT,
  p_product_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v          public.vouchers;
  v_begrenzt BOOLEAN;
  v_namen    JSONB;
  v_artikel  JSONB := NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;

  v := public.gutschein_pruefen(p_code, auth.uid(), NULL, false);
  v_begrenzt := cardinality(v.category_ids) > 0;

  SELECT COALESCE(jsonb_agg(c.name ORDER BY c.order_index, c.name), '[]'::jsonb)
  INTO v_namen
  FROM public.categories c
  WHERE c.id = ANY (v.category_ids);

  -- Nur aktive Artikel, wie beim Bestellen. NULL = gilt für alles.
  IF v_begrenzt THEN
    SELECT COALESCE(jsonb_agg(p.id), '[]'::jsonb)
    INTO v_artikel
    FROM public.products p
    WHERE p.id = ANY (COALESCE(p_product_ids, '{}'::UUID[]))
      AND p.is_active
      AND p.category_id = ANY (v.category_ids);
  END IF;

  RETURN jsonb_build_object(
    'code', v.code,
    'kind', v.kind,
    'value', v.value,
    'min_order_amount', v.min_order_amount,
    'category_names', v_namen,
    'product_ids', v_artikel
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gutschein_abfragen(TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gutschein_abfragen(TEXT, UUID[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. create_order – wie Migration 054, geändert ist nur der Gutschein-Block.
--    Signatur identisch, CREATE OR REPLACE ersetzt an Ort und Stelle.
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
  p_delivery_country TEXT        DEFAULT NULL,
  p_voucher_code     TEXT        DEFAULT NULL
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
  v_satz       NUMERIC(5, 2) := 0;
  v_kunde_rab  NUMERIC(12, 2) := 0;
  v_basis      NUMERIC(12, 2);
  v_voucher    public.vouchers;
  v_gut_rab    NUMERIC(12, 2) := 0;
  v_gut_summe  NUMERIC(12, 2) := 0;   -- Warenwert, für den der Gutschein gilt
  v_gut_basis  NUMERIC(12, 2) := 0;   -- davon der Rest nach der Sonderkondition
  v_gut_namen  TEXT;
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

  -- Sonderkondition auf den Warenwert (lib/rabatt.ts, Schritt 2)
  SELECT discount_percent INTO v_satz
  FROM public.customer_conditions
  WHERE customer_id = auth.uid();
  v_satz := COALESCE(v_satz, 0);
  v_kunde_rab := ROUND(v_total * v_satz / 100, 2);
  v_basis := v_total - v_kunde_rab;

  -- Gutschein (Schritt 3). Ein ungültiger Code bricht die Bestellung ab,
  -- statt still ohne Rabatt durchzulaufen: der Kunde hat mit dem Abzug
  -- gerechnet.
  IF NULLIF(btrim(COALESCE(p_voucher_code, '')), '') IS NOT NULL THEN
    -- Erst ohne Mindestwert prüfen und die Zeile sperren: gegen welchen
    -- Warenwert der Mindestwert gilt, hängt an den Warengruppen des Gutscheins.
    v_voucher := public.gutschein_pruefen(p_voucher_code, auth.uid(), NULL, true);

    IF cardinality(v_voucher.category_ids) > 0 THEN
      SELECT COALESCE(SUM(oi.subtotal), 0) INTO v_gut_summe
      FROM public.order_items oi
      JOIN public.product_variants pv ON pv.id = oi.product_variant_id
      JOIN public.products p ON p.id = pv.product_id
      WHERE oi.order_id = v_order.id
        AND p.category_id = ANY (v_voucher.category_ids);

      IF v_gut_summe <= 0 THEN
        SELECT string_agg(c.name, ', ' ORDER BY c.order_index, c.name) INTO v_gut_namen
        FROM public.categories c
        WHERE c.id = ANY (v_voucher.category_ids);
        RAISE EXCEPTION 'Der Gutschein % gilt nur für: %.',
          v_voucher.code, COALESCE(v_gut_namen, 'bestimmte Warengruppen');
      END IF;
    ELSE
      v_gut_summe := v_total;
    END IF;

    -- Mindestwert gegen den Warenwert, für den der Gutschein gilt.
    PERFORM public.gutschein_pruefen(p_voucher_code, auth.uid(), v_gut_summe, false);

    v_gut_basis := LEAST(v_gut_summe - ROUND(v_gut_summe * v_satz / 100, 2), v_basis);

    IF v_voucher.kind = 'percent' THEN
      v_gut_rab := ROUND(v_gut_basis * v_voucher.value / 100, 2);
    ELSE
      v_gut_rab := LEAST(v_voucher.value, v_gut_basis);
    END IF;
  END IF;

  UPDATE public.orders
  SET subtotal_amount           = v_total,
      customer_discount_percent = v_satz,
      customer_discount_amount  = v_kunde_rab,
      voucher_id                = v_voucher.id,
      voucher_code              = v_voucher.code,
      voucher_discount_amount   = v_gut_rab,
      total_amount              = v_basis - v_gut_rab
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
