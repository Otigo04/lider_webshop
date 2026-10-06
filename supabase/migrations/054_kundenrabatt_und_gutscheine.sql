-- =============================================================================
-- 054 – Sonderkonditionen je Kunde und Gutscheine (Aktionscodes)
--
-- 1. customer_conditions: Prozentrabatt auf alles für einzelne Kunden
--    („Bekannte", Stammkunden). Eigene Tabelle statt Spalte an users: users
--    darf der Kunde selbst lesen und ändern (users_update_self), die
--    Kondition und die interne Notiz dazu nicht.
-- 2. vouchers: Gutscheincodes, Prozent oder fester Betrag, mit Laufzeit,
--    Mindestwert, Einlösegrenzen und optional an einen Kunden gebunden.
-- 3. orders: Warenwert, Konditions- und Gutscheinabzug als Snapshot.
--    total_amount bleibt der Nettobetrag, auf den die Steuer gerechnet wird
--    – nur steht er jetzt nach den Rabatten. Rechnung, Kasse und
--    Buchhaltung lesen weiter total_amount und müssen nichts umrechnen.
-- 4. create_order() wendet beides an. Die Rechnung für die Anzeige steht in
--    lib/rabatt.ts und folgt derselben Reihenfolge und Rundung.
--
-- Idempotent: mehrfaches Einspielen schadet nicht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sonderkonditionen
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_conditions (
  customer_id      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
                     CHECK (discount_percent >= 0 AND discount_percent < 100),
  note             TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_conditions_admin ON public.customer_conditions;
CREATE POLICY customer_conditions_admin ON public.customer_conditions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_conditions TO authenticated;

-- Der Kunde sieht nur seinen Satz, nicht die Notiz („Bekannter von …").
CREATE OR REPLACE FUNCTION public.meine_kondition()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT discount_percent
    FROM public.customer_conditions
    WHERE customer_id = auth.uid() AND public.is_active_user()
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.meine_kondition() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meine_kondition() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Gutscheine
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vouchers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Großbuchstaben, Ziffern, Bindestrich – lib/rabatt.ts CODE_MUSTER
  code             TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{3,32}$'),
  -- intern, erscheint nie beim Kunden
  description      TEXT CHECK (description IS NULL OR char_length(description) <= 300),
  kind             TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value            NUMERIC(10, 2) NOT NULL
                     CHECK (value > 0 AND (kind <> 'percent' OR value <= 100)),
  min_order_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  valid_from       TIMESTAMPTZ,
  valid_until      TIMESTAMPTZ,
  -- NULL = unbegrenzt
  max_redemptions  INT CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  max_per_customer INT DEFAULT 1 CHECK (max_per_customer IS NULL OR max_per_customer > 0),
  -- gesetzt = nur dieser Kunde kann ihn einlösen
  customer_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_customer ON public.vouchers(customer_id);

DROP TRIGGER IF EXISTS trg_vouchers_updated_at ON public.vouchers;
CREATE TRIGGER trg_vouchers_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

-- Nur der Admin liest die Tabelle. Kunden prüfen einen Code ausschließlich
-- über gutschein_abfragen(); eine Liste aller Codes gibt es für sie nicht.
DROP POLICY IF EXISTS vouchers_admin ON public.vouchers;
CREATE POLICY vouchers_admin ON public.vouchers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Snapshot an der Bestellung
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal_amount          NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS customer_discount_percent NUMERIC(5, 2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_discount_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- RESTRICT: ein eingelöster Gutschein lässt sich nicht löschen, nur
  -- deaktivieren. Sonst zählten seine Einlösungen nicht mehr.
  ADD COLUMN IF NOT EXISTS voucher_id               UUID REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS voucher_code             TEXT,
  ADD COLUMN IF NOT EXISTS voucher_discount_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.subtotal_amount IS
  'Warenwert netto vor Sonderkondition und Gutschein. NULL bei Bestellungen vor Migration 054 (dann = total_amount).';

CREATE INDEX IF NOT EXISTS idx_orders_voucher ON public.orders(voucher_id)
  WHERE voucher_id IS NOT NULL;

-- Bestellungen entstehen nur über create_order() / create_admin_order()
-- (beide SECURITY DEFINER). Ein direktes INSERT durch den Kunden könnte
-- sonst Rabattfelder und Summen frei setzen.
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS order_items_insert_own ON public.order_items;

-- -----------------------------------------------------------------------------
-- 4. Gutschein prüfen
-- -----------------------------------------------------------------------------

-- Intern: nicht für Kunden aufrufbar. p_warenwert NULL = Mindestwert nicht
-- prüfen (Vorschau im Formular, der Warenwert steht erst beim Bestellen fest).
CREATE OR REPLACE FUNCTION public.gutschein_pruefen(
  p_code     TEXT,
  p_customer UUID,
  p_warenwert NUMERIC,
  p_sperren  BOOLEAN DEFAULT false
)
RETURNS public.vouchers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code     TEXT := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v          public.vouchers;
  v_gesamt   INT;
  v_eigene   INT;
BEGIN
  IF p_sperren THEN
    -- Sperre gegen zwei gleichzeitige Bestellungen mit dem letzten freien
    -- Einlöseplatz.
    SELECT * INTO v FROM public.vouchers WHERE code = v_code FOR UPDATE;
  ELSE
    SELECT * INTO v FROM public.vouchers WHERE code = v_code;
  END IF;

  -- Ein fremder, kundengebundener Code meldet dasselbe wie ein unbekannter:
  -- dass es ihn gibt, geht den Fragenden nichts an.
  IF NOT FOUND OR NOT v.is_active
     OR (v.customer_id IS NOT NULL AND v.customer_id IS DISTINCT FROM p_customer) THEN
    RAISE EXCEPTION 'Dieser Gutscheincode ist ungültig.';
  END IF;

  IF v.valid_from IS NOT NULL AND v.valid_from > now() THEN
    RAISE EXCEPTION 'Dieser Gutschein gilt erst ab %.',
      to_char(v.valid_from AT TIME ZONE public.pos_zeitzone(), 'DD.MM.YYYY');
  END IF;

  IF v.valid_until IS NOT NULL AND v.valid_until <= now() THEN
    RAISE EXCEPTION 'Dieser Gutschein ist abgelaufen.';
  END IF;

  IF v.max_redemptions IS NOT NULL THEN
    SELECT COUNT(*) INTO v_gesamt FROM public.orders WHERE voucher_id = v.id;
    IF v_gesamt >= v.max_redemptions THEN
      RAISE EXCEPTION 'Dieser Gutschein ist bereits vollständig eingelöst.';
    END IF;
  END IF;

  IF v.max_per_customer IS NOT NULL THEN
    SELECT COUNT(*) INTO v_eigene
    FROM public.orders
    WHERE voucher_id = v.id AND customer_id = p_customer;
    IF v_eigene >= v.max_per_customer THEN
      RAISE EXCEPTION 'Sie haben diesen Gutschein bereits eingelöst.';
    END IF;
  END IF;

  IF p_warenwert IS NOT NULL AND p_warenwert < v.min_order_amount THEN
    RAISE EXCEPTION 'Der Gutschein gilt ab einem Warenwert von % € netto.',
      replace(to_char(v.min_order_amount, 'FM999999990.00'), '.', ',');
  END IF;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.gutschein_pruefen(TEXT, UUID, NUMERIC, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- Für das Bestellformular: gibt nur heraus, was der Kunde zum Rechnen braucht
-- – keine interne Beschreibung, keine Grenzen, keine ID.
CREATE OR REPLACE FUNCTION public.gutschein_abfragen(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.vouchers;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;

  v := public.gutschein_pruefen(p_code, auth.uid(), NULL, false);

  RETURN jsonb_build_object(
    'code', v.code,
    'kind', v.kind,
    'value', v.value,
    'min_order_amount', v.min_order_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gutschein_abfragen(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gutschein_abfragen(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. create_order mit Kondition und Gutschein
--
--    Neuer letzter Parameter p_voucher_code. Die alte Signatur wird entfernt,
--    sonst stünden zwei Überladungen nebeneinander und PostgREST könnte einen
--    Aufruf ohne Gutschein nicht eindeutig zuordnen.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
);

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

  -- Gutschein auf den Rest (Schritt 3). Ein ungültiger Code bricht die
  -- Bestellung ab, statt still ohne Rabatt durchzulaufen: der Kunde hat mit
  -- dem Abzug gerechnet.
  IF NULLIF(btrim(COALESCE(p_voucher_code, '')), '') IS NOT NULL THEN
    v_voucher := public.gutschein_pruefen(p_voucher_code, auth.uid(), v_total, true);
    IF v_voucher.kind = 'percent' THEN
      v_gut_rab := ROUND(v_basis * v_voucher.value / 100, 2);
    ELSE
      v_gut_rab := LEAST(v_voucher.value, v_basis);
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
