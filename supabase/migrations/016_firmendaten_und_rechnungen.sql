-- =============================================================================
-- Migration 016 – Firmendaten & manuelle Rechnungen
--
-- Zwei Themen in einer Datei, weil eng verzahnt: company_settings liefert die
-- Absenderdaten, die jede Rechnung braucht (auch die automatisch beim
-- Checkout erzeugten); invoices/invoice_items tragen jetzt auch freie
-- Rechnungen ohne Bestellbezug (Dienstleistungen, Ware außerhalb des
-- Katalogs) und Bestellungen, die der Admin manuell für einen Kunden anlegt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. company_settings – Singleton-Tabelle mit den eigenen Firmendaten.
--    Klassisches "id BOOLEAN PRIMARY KEY CHECK (id)"-Muster: es kann nie mehr
--    als eine Zeile geben. Felder starten leer, der Admin füllt sie unter
--    /admin/settings aus.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_settings (
  id                 BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  company_name       TEXT,
  address_street     TEXT,
  address_zip        TEXT,
  address_city       TEXT,
  address_country    TEXT NOT NULL DEFAULT 'Deutschland',
  tax_number         TEXT,   -- Steuernummer
  vat_id             TEXT,   -- USt-IdNr.
  bank_name          TEXT,
  iban               TEXT,
  bic                TEXT,
  payment_terms_days INT NOT NULL DEFAULT 14,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.company_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_settings_read        ON public.company_settings;
DROP POLICY IF EXISTS company_settings_admin_write  ON public.company_settings;

-- Lesbar für jeden angemeldeten aktiven Nutzer: die Daten stehen ohnehin auf
-- jeder Rechnung, die er sieht. Schreiben darf nur der Admin.
CREATE POLICY company_settings_read ON public.company_settings
  FOR SELECT TO authenticated USING (public.is_active_user());

CREATE POLICY company_settings_admin_write ON public.company_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_company_settings_updated_at ON public.company_settings;
CREATE TRIGGER trg_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. invoices – order_id wird nullable (freie Rechnungen haben keine
--    Bestellung), customer_id kommt direkt an die Zeile (vereinfacht RLS und
--    Abfragen, statt jedes Mal über orders zu joinen).
-- -----------------------------------------------------------------------------

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_id  UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS type         TEXT NOT NULL DEFAULT 'order' CHECK (type IN ('order', 'manual')),
  ADD COLUMN IF NOT EXISTS notes        TEXT,
  ADD COLUMN IF NOT EXISTS net_amount   NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS vat_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2);

-- Bestehende Zeilen aus der zugehörigen Bestellung befüllen, bevor NOT NULL
-- erzwungen wird.
UPDATE public.invoices i
SET customer_id = o.customer_id
FROM public.orders o
WHERE i.order_id = o.id AND i.customer_id IS NULL;

ALTER TABLE public.invoices ALTER COLUMN customer_id SET NOT NULL;

-- order_id war bisher NOT NULL UNIQUE (Migration 015). Freie Rechnungen haben
-- keine Bestellung, die 1:1-Eindeutigkeit soll aber für gesetzte order_ids
-- weiter gelten – deshalb NOT NULL raus, UNIQUE als partieller Index wieder rein.
ALTER TABLE public.invoices ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_order_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order_unique
  ON public.invoices (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_manual_has_totals;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_manual_has_totals
  CHECK (type <> 'manual' OR (net_amount IS NOT NULL AND total_amount IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices (customer_id);

-- RLS: jetzt direkt über customer_id statt über den Join zu orders.
DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
CREATE POLICY invoices_select_own ON public.invoices
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND public.is_active_user());
-- invoices_admin_all bleibt unverändert (aus Migration 015).

-- -----------------------------------------------------------------------------
-- 3. invoice_items – Positionen freier Rechnungen. Bestellungs-Rechnungen
--    zeigen weiterhin ihre Positionen über order_items an.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  vat_rate    NUMERIC(4, 2) NOT NULL DEFAULT 0 CHECK (vat_rate IN (0, 7, 19)),
  subtotal    NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items (invoice_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_items_select_own ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_admin_all  ON public.invoice_items;

CREATE POLICY invoice_items_select_own ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id AND inv.customer_id = auth.uid()
    ) AND public.is_active_user()
  );

CREATE POLICY invoice_items_admin_all ON public.invoice_items
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. Storage: "invoices read own" erweitern. Bisher matchte die Policy nur
--    <order_id>/... als Pfad-Präfix. Freie Rechnungen laden unter
--    <invoice_id>/... hoch, weil sie keine Bestellung haben. Beide Varianten
--    bleiben erlaubt, damit bereits hochgeladene Bestellungs-Rechnungen
--    weiter erreichbar sind.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "invoices read own" ON storage.objects;

CREATE POLICY "invoices read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.is_active_user()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.customer_id = auth.uid()
          AND (
            inv.id::text = split_part(storage.objects.name, '/', 1)
            OR inv.order_id::text = split_part(storage.objects.name, '/', 1)
          )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. create_invoice_for_order anpassen – customer_id und type müssen jetzt
--    beim Insert mitgegeben werden (customer_id ist NOT NULL).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invoice_for_order(p_order_id UUID)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   public.orders;
  v_invoice public.invoices;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden.';
  END IF;

  IF v_order.customer_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Bestellung.';
  END IF;

  INSERT INTO public.invoices (order_id, customer_id, type)
  VALUES (p_order_id, v_order.customer_id, 'order')
  ON CONFLICT (order_id) DO UPDATE SET order_id = EXCLUDED.order_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. create_admin_order – Admin legt eine Bestellung für einen Kunden an.
--    Weitgehend eine Kopie von create_order() (Migration 002), aber:
--      - customer_id kommt als Parameter, nicht aus auth.uid()
--      - Stückpreis pro Position optional überschreibbar (Admin trägt Preis
--        frei ein statt der Staffel zu folgen)
--      - Status direkt 'confirmed', kein 'submitted'-Zwischenschritt
--      - nur is_admin() darf aufrufen
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_admin_order(
  p_customer_id      UUID,
  p_items            JSONB,  -- [{"product_id":"uuid","quantity":25,"unit_price":1.10}, ...]
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
  v_free    INT;
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

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_row.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artikel nicht gefunden.';
    END IF;

    v_free := GREATEST(v_product.stock_available - v_product.stock_reserved, 0);
    IF v_row.quantity > v_free THEN
      RAISE EXCEPTION 'Von "%" sind nur noch % Stück verfügbar.',
        v_product.name, v_free;
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
$$;

REVOKE ALL ON FUNCTION public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. create_manual_invoice – freie Rechnung ohne Bestellbezug (Dienstleistung,
--    Ware außerhalb des Katalogs). Summen kommen wie überall im Projekt aus
--    der Datenbankfunktion, nie vom Client.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_manual_invoice(
  p_customer_id UUID,
  p_notes       TEXT,
  p_items       JSONB  -- [{"description":"...","quantity":1,"unit_price":100,"vat_rate":19}, ...]
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices;
  v_row     RECORD;
  v_net     NUMERIC(12, 2) := 0;
  v_vat     NUMERIC(12, 2) := 0;
  v_sub     NUMERIC(12, 2);
  v_linevat NUMERIC(12, 2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keine Positionen angegeben.';
  END IF;

  INSERT INTO public.invoices (
    order_id, customer_id, type, notes, net_amount, vat_amount, total_amount
  )
  VALUES (
    NULL, p_customer_id, 'manual',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    0, 0, 0
  )
  RETURNING * INTO v_invoice;

  FOR v_row IN
    SELECT (item ->> 'description')                    AS description,
           (item ->> 'quantity')::NUMERIC               AS quantity,
           (item ->> 'unit_price')::NUMERIC             AS unit_price,
           COALESCE((item ->> 'vat_rate')::NUMERIC, 0)  AS vat_rate
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.description IS NULL OR btrim(v_row.description) = '' THEN
      RAISE EXCEPTION 'Beschreibung fehlt.';
    END IF;
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;
    IF v_row.unit_price IS NULL OR v_row.unit_price < 0 THEN
      RAISE EXCEPTION 'Ungültiger Preis.';
    END IF;
    IF v_row.vat_rate NOT IN (0, 7, 19) THEN
      RAISE EXCEPTION 'Ungültiger MwSt.-Satz.';
    END IF;

    v_sub := ROUND(v_row.quantity * v_row.unit_price, 2);
    v_linevat := ROUND(v_sub * v_row.vat_rate / 100, 2);
    v_net := v_net + v_sub;
    v_vat := v_vat + v_linevat;

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, vat_rate, subtotal
    )
    VALUES (
      v_invoice.id, btrim(v_row.description), v_row.quantity,
      v_row.unit_price, v_row.vat_rate, v_sub
    );
  END LOOP;

  UPDATE public.invoices
  SET net_amount = v_net, vat_amount = v_vat, total_amount = v_net + v_vat
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_invoice(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_invoice(UUID, TEXT, JSONB) TO authenticated;
