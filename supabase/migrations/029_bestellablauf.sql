-- =============================================================================
-- Migration 029 – Bestellablauf: Steuer, Zahlart, Lieferadresse, Abholung
--
-- Sechs zusammenhängende Änderungen. Sie stehen bewusst in einer Migration,
-- weil create_order() sie gleichzeitig braucht:
--
--  1. Adressdaten aus der Registrierung landen im Profil.
--  2. Umsatzsteuer an der Bestellung. Bisher rechnete der Katalog rein netto
--     und die Rechnung wies keine Steuer aus. Der Kunde soll den Betrag
--     sehen, den er überweist – das ist der Bruttobetrag. Der Satz wird beim
--     Anlegen aus company_settings festgeschrieben; ändert sich der Satz
--     später, bleibt die alte Bestellung, wie sie war.
--  3. Zahlart: Überweisung (Vorgabe) oder – nur bei Selbstabholung – bar bzw.
--     Karte am Tresen.
--  4. Strukturierte Lieferadresse. Das eine Freitextfeld reichte für eine
--     Rechnung nicht; Name, Straße, PLZ, Ort und Land stehen jetzt einzeln.
--     delivery_address bleibt als zusammengesetzter Text erhalten – bereits
--     gespeicherte Bestellungen haben nichts anderes.
--  5. Abholtermin und Status "abholbereit". Der Kunde kann bei der Bestellung
--     einen Wunschtermin angeben, der Admin meldet die Ware als abholbereit.
--  6. Rechnungsnummern beginnen mit LD statt LI. Bereits vergebene Nummern
--     bleiben unverändert – eine gestellte Rechnung behält ihre Nummer, sonst
--     bricht die fortlaufende Nummerierung. Der Zähler läuft weiter, LI und LD
--     können sich deshalb nicht überschneiden.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Adressdaten aus der Registrierung übernehmen
--
-- Beim Self-Signup gibt es zum Zeitpunkt des Triggers noch keine Session, mit
-- der die Anwendung die Adresse nachtragen könnte – bei aktivierter
-- E-Mail-Bestätigung schon gar nicht. Die Felder reisen deshalb in
-- raw_user_meta_data mit und werden hier ins Profil geschrieben.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  m JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::JSONB);
BEGIN
  INSERT INTO public.users (
    id, email, full_name, company_name, role,
    billing_street, billing_zip, billing_city, billing_country,
    shipping_street, shipping_zip, shipping_city, shipping_country
  )
  VALUES (
    NEW.id,
    NEW.email,
    m ->> 'full_name',
    m ->> 'company_name',
    COALESCE(m ->> 'role', 'customer'),
    m ->> 'billing_street',
    m ->> 'billing_zip',
    m ->> 'billing_city',
    COALESCE(m ->> 'billing_country', 'Deutschland'),
    -- Ohne abweichende Lieferadresse gilt die Rechnungsadresse. So ist der
    -- Vorschlag im Checkout ab dem ersten Login gefüllt.
    COALESCE(m ->> 'shipping_street',  m ->> 'billing_street'),
    COALESCE(m ->> 'shipping_zip',     m ->> 'billing_zip'),
    COALESCE(m ->> 'shipping_city',    m ->> 'billing_city'),
    COALESCE(m ->> 'shipping_country', m ->> 'billing_country', 'Deutschland')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 2. Neue Spalten an orders
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders
  -- Steuersatz zum Bestellzeitpunkt in Prozent. Nicht der jeweils aktuelle
  -- Satz aus den Einstellungen: eine Bestellung von letztem Jahr darf sich
  -- nicht rückwirkend anders rechnen.
  ADD COLUMN IF NOT EXISTS vat_rate         NUMERIC(5, 2) NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS payment_method   TEXT NOT NULL DEFAULT 'transfer',
  -- Wunschtermin des Kunden für die Selbstabholung.
  ADD COLUMN IF NOT EXISTS pickup_at        TIMESTAMPTZ,
  -- Zeitpunkt, zu dem der Admin die Ware als abholbereit gemeldet hat.
  ADD COLUMN IF NOT EXISTS ready_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_name    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_street  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_zip     TEXT,
  ADD COLUMN IF NOT EXISTS delivery_city    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_country TEXT;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('transfer', 'cash', 'card'));
  END IF;
END
$do$;

-- Bar und Karte gibt es nur am Tresen. Eine versendete Bestellung, die auf
-- "bar" steht, wäre eine Forderung, die niemand je einzieht.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_needs_pickup'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_needs_pickup
      CHECK (payment_method = 'transfer' OR delivery_method = 'pickup');
  END IF;
END
$do$;

-- Status "abholbereit" zwischen bestätigt und geliefert.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'submitted', 'confirmed', 'ready', 'shipped', 'delivered'));

-- -----------------------------------------------------------------------------
-- 3. create_order – Steuersatz, Zahlart, Abholtermin, Adressfelder
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT, TEXT);

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
  v_order   public.orders;
  v_product public.products;
  v_tier    public.product_variants;
  v_row     RECORD;
  v_free    INT;
  v_sub     NUMERIC(12, 2);
  v_total   NUMERIC(12, 2) := 0;
  v_vat     NUMERIC(5, 2);
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

  IF p_pickup_at IS NOT NULL AND p_pickup_at < now() THEN
    RAISE EXCEPTION 'Der Abholtermin liegt in der Vergangenheit.';
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

REVOKE ALL ON FUNCTION public.create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Abholbereit melden
--
-- Eigene Funktion statt eines nackten UPDATE, weil zwei Dinge zusammengehören:
-- der Status und der Zeitpunkt der Meldung. Der Zeitpunkt steht später in der
-- Benachrichtigung an den Kunden.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_order_ready(p_order_id UUID)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_order public.orders;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Admins dürfen Bestellungen als abholbereit melden.';
  END IF;

  UPDATE public.orders
  SET status = 'ready', ready_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden.';
  END IF;

  RETURN v_order;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_order_ready(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_ready(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Rechnung zur Bestellung: Beträge mitschreiben
--
-- Bisher blieben net_amount/vat_amount/total_amount bei Bestellungs-Rechnungen
-- leer, weil der Katalog netto rechnete und die Zahlen in orders standen. Mit
-- ausgewiesener Steuer gehören sie an die Rechnung – sonst müsste jede
-- Auswertung den Steuersatz erneut von der Bestellung holen.
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

  IF v_order.customer_id <> auth.uid() AND NOT public.is_admin() THEN
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
    order_id, customer_id, type, net_amount, vat_amount, total_amount
  )
  VALUES (
    p_order_id, v_order.customer_id, 'order', v_net, v_vat, v_net + v_vat
  )
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$fn$;

-- Bestehende Bestellungs-Rechnungen ohne Beträge nachziehen. Die Steuer bleibt
-- dort 0, weil damals ohne Steuerausweis fakturiert wurde – die Rechnung
-- bleibt damit genau die, die der Kunde bekommen hat.
UPDATE public.invoices i
SET net_amount   = o.total_amount,
    vat_amount   = 0,
    total_amount = o.total_amount
FROM public.orders o
WHERE i.order_id = o.id
  AND i.type = 'order'
  AND i.net_amount IS NULL;

-- -----------------------------------------------------------------------------
-- 6. Rechnungsnummern: LD statt LI
-- -----------------------------------------------------------------------------

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number
  SET DEFAULT 'LD' || lpad(nextval('public.invoice_number_seq')::TEXT, 7, '0');
