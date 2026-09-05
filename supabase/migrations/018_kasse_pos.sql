-- =============================================================================
-- Migration 018 – Ladenkasse (POS)
--
-- Der Laden verkauft auch über den Tresen. Diese Verkäufe laufen nicht über
-- orders: dort hängt eine Reservierungslogik, ein Lieferweg und ein Kundenkonto
-- dran, und nichts davon gibt es an der Kasse. Ein Barverkauf ist sofort
-- abgeschlossen, der Bestand geht unmittelbar herunter, ein Kunde ist optional.
-- Deshalb eigene Tabellen.
--
-- Enthalten:
--   1. products.barcode        – der Scanner liest EAN/UPC, nicht unsere SKU
--   2. company_settings.pos_*  – Steuersatz und Kassenvorgaben aus der DB
--   3. pos_sales / pos_sale_items
--   4. create_pos_sale()       – Verkauf buchen und Bestand atomar abbuchen
--   5. pos_daily_summary       – Kennzahlen fürs Dashboard
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Barcode am Artikel
-- -----------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Partiell eindeutig: die meisten Artikel haben (noch) keinen Barcode, und
-- NULL darf beliebig oft vorkommen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode
  ON public.products (barcode) WHERE barcode IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Kassenvorgaben in den Firmendaten – kein fester Steuersatz im Code
-- -----------------------------------------------------------------------------

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_vat_rate       NUMERIC(4, 2) NOT NULL DEFAULT 19
    CHECK (pos_vat_rate IN (0, 7, 19)),
  -- Kassenpreise sind Ladenpreise: im B2B-Shop sind alle Preise netto, am
  -- Tresen erwartet der Kunde den Endpreis. Welche Lesart gilt, entscheidet
  -- der Betrieb, nicht der Code.
  ADD COLUMN IF NOT EXISTS pos_prices_gross   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pos_receipt_footer TEXT;

-- -----------------------------------------------------------------------------
-- 3. Verkäufe und Positionen
-- -----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.pos_receipt_seq START 1;

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL
                   DEFAULT 'LB' || lpad(nextval('public.pos_receipt_seq')::TEXT, 7, '0'),
  -- NULL = Verkauf ohne Kundenkonto (Laufkundschaft). SET NULL statt RESTRICT:
  -- ein gelöschtes Kundenkonto darf keinen Kassenbon mitreißen, die
  -- Bezeichnung bleibt im Klartext erhalten.
  customer_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_label TEXT,
  cashier_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash', 'card')),
  vat_rate       NUMERIC(4, 2) NOT NULL DEFAULT 19,
  net_amount     NUMERIC(12, 2) NOT NULL CHECK (net_amount >= 0),
  vat_amount     NUMERIC(12, 2) NOT NULL CHECK (vat_amount >= 0),
  total_amount   NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  note           TEXT,
  -- Beleg-PDF im Bucket 'invoices' unter pos/<sale_id>/<receipt_number>.pdf
  file_path      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_created  ON public.pos_sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_customer ON public.pos_sales (customer_id);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id      UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  -- Wie bei order_items: Name und Nummer als Schnappschuss, damit ein später
  -- gelöschter Artikel den Bon nicht unlesbar macht.
  product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku  TEXT NOT NULL,
  barcode      TEXT,
  quantity     INT NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  subtotal     NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale    ON public.pos_sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_product ON public.pos_sale_items (product_id);

-- -----------------------------------------------------------------------------
-- 4. RLS – die Kasse ist Personal, nicht Kundschaft
-- -----------------------------------------------------------------------------

ALTER TABLE public.pos_sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_sales_admin_all      ON public.pos_sales;
DROP POLICY IF EXISTS pos_sales_select_own     ON public.pos_sales;
DROP POLICY IF EXISTS pos_sale_items_admin_all ON public.pos_sale_items;
DROP POLICY IF EXISTS pos_sale_items_select_own ON public.pos_sale_items;

CREATE POLICY pos_sales_admin_all ON public.pos_sales
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Wurde der Verkauf auf ein Kundenkonto gebucht, sieht der Kunde seinen Bon
-- im Portal – lesend, wie eine Rechnung.
CREATE POLICY pos_sales_select_own ON public.pos_sales
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND public.is_active_user());

CREATE POLICY pos_sale_items_admin_all ON public.pos_sale_items
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY pos_sale_items_select_own ON public.pos_sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_sales s
      WHERE s.id = pos_sale_items.sale_id AND s.customer_id = auth.uid()
    ) AND public.is_active_user()
  );

-- -----------------------------------------------------------------------------
-- 5. create_pos_sale – Verkauf buchen
--
-- Alles in einer Transaktion und mit Zeilensperre: zwei Kassen (oder Kasse und
-- Onlinebestellung) dürfen denselben letzten Artikel nicht zweimal verkaufen.
-- Summen rechnet die Datenbank, nie der Browser.
--
-- p_items: [{"product_id":"uuid"|null,"name":"...","sku":"...","barcode":"...",
--            "quantity":2,"unit_price":9.90}, ...]
-- Positionen ohne product_id sind freie Zeilen (Pfand, Sonderposten) – sie
-- berühren keinen Bestand.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pos_sale(
  p_items          JSONB,
  p_customer_id    UUID    DEFAULT NULL,
  p_customer_label TEXT    DEFAULT NULL,
  p_payment_method TEXT    DEFAULT 'cash',
  p_note           TEXT    DEFAULT NULL,
  p_prices_gross   BOOLEAN DEFAULT NULL,
  p_vat_rate       NUMERIC DEFAULT NULL
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

      -- Reservierte Mengen gehören zu offenen Onlinebestellungen und stehen
      -- an der Kasse nicht zur Verfügung.
      IF v_row.quantity > GREATEST(v_product.stock_available - v_product.stock_reserved, 0) THEN
        RAISE EXCEPTION 'Von "%" sind nur noch % Stück verfügbar.',
          v_product.name,
          GREATEST(v_product.stock_available - v_product.stock_reserved, 0);
      END IF;

      UPDATE public.products
      SET stock_available = stock_available - v_row.quantity
      WHERE id = v_product.id;
    ELSE
      v_product := NULL;
    END IF;

    v_sub   := ROUND(v_row.unit_price * v_row.quantity, 2);
    v_summe := v_summe + v_sub;

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

  IF v_gross THEN
    -- Eingegebene Preise sind Endpreise: Steuer herausrechnen.
    v_total := ROUND(v_summe, 2);
    v_net   := ROUND(v_total / (1 + v_rate / 100), 2);
    v_vat   := ROUND(v_total - v_net, 2);
  ELSE
    v_net   := ROUND(v_summe, 2);
    v_vat   := ROUND(v_net * v_rate / 100, 2);
    v_total := ROUND(v_net + v_vat, 2);
  END IF;

  UPDATE public.pos_sales
  SET net_amount = v_net, vat_amount = v_vat, total_amount = v_total
  WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_sale(JSONB, UUID, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, UUID, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Kennzahlen fürs Dashboard. Als Funktion statt als View, damit der
--    Zeitraum ein Parameter ist und nicht in der Anwendung nachgerechnet wird.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pos_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (sales_count BIGINT, net_total NUMERIC, gross_total NUMERIC)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::BIGINT,
         COALESCE(SUM(net_amount), 0),
         COALESCE(SUM(total_amount), 0)
  FROM public.pos_sales
  WHERE public.is_admin()
    AND created_at >= p_from
    AND created_at < p_to;
$$;

REVOKE ALL ON FUNCTION public.pos_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Storage: Kassenbelege liegen im Bucket 'invoices' unter pos/<sale_id>/.
--    Die bestehende Lesepolicy prüft das erste Pfadsegment gegen Rechnungen –
--    für Bons muss sie um den pos-Zweig erweitert werden.
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
            inv.id::text       = split_part(storage.objects.name, '/', 1)
            OR inv.order_id::text = split_part(storage.objects.name, '/', 1)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.pos_sales s
        WHERE s.customer_id = auth.uid()
          AND split_part(storage.objects.name, '/', 1) = 'pos'
          AND s.id::text = split_part(storage.objects.name, '/', 2)
      )
    )
  );
