-- =============================================================================
-- Migration 047 – Einkaufspreis
--
-- Das Schema führte bisher zwei Preise: die Großhandelsstaffeln in
-- product_variants und den Ladenpreis products.retail_price (Migration 022).
-- Was die Ware im Einkauf gekostet hat, stand nirgends – und das ist die eine
-- Zahl, die man am Tresen beim Verhandeln braucht und nicht im Kopf hat.
--
-- Warum eine eigene Tabelle und keine Spalte an products:
-- RLS wirkt zeilenweise. Die Policy products_read (Migration 020) gibt jedem
-- angemeldeten aktiven Kunden die *ganze* Zeile frei – deshalb ist auch
-- retail_price heute schon kundenlesbar. Spaltengrants lösen das nicht:
-- Migration 034 schützt damit anon, aber Admin und Kunde sind beide
-- `authenticated`, und ein GRANT gilt der Rolle, nicht der Person. Eine eigene
-- Tabelle mit is_admin() ist der einzige Weg, der den Wert wirklich dichthält,
-- und kostet nur einen Join.
--
-- Der Einkaufspreis wird nie gedruckt: nicht aufs Preisschild, nicht auf Bon,
-- Beleg, Z-Bon oder Rechnung. Der verdeckte Code auf dem Preisschild
-- (ghCode(), "123123#1299") bleibt unverändert der Großhandelspreis, damit
-- bereits gedruckte Schilder im Regal weiter dasselbe bedeuten.
--
-- Enthalten:
--   1. product_costs            – Einkaufspreis am Artikel, nur für Admins
--   2. stock_entries.cost_price – was eine einzelne Lieferung gekostet hat
--   3. record_stock_entries()   – nimmt cost_price mit auf
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Einkaufspreis am Artikel
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_costs (
  -- Primärschlüssel ist die Artikel-ID: ein Artikel hat einen geltenden
  -- Einkaufspreis. Die Geschichte steht im Journal, nicht hier.
  product_id  UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_price  NUMERIC(10, 2) NOT NULL CHECK (cost_price >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_costs IS
  'Einkaufspreis je Artikel. Eigene Tabelle statt Spalte an products, weil RLS zeilenweise wirkt und products_read angemeldeten Kunden die ganze Zeile freigibt. Nur für Admins lesbar, wird nie gedruckt.';

-- ON DELETE CASCADE, anders als bei stock_entries: der Einkaufspreis ist eine
-- Angabe am Artikel und ohne ihn sinnlos. Das Journal dagegen ist Geschichte
-- und überlebt den Artikel (ON DELETE SET NULL).

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_costs_admin_all ON public.product_costs;

CREATE POLICY product_costs_admin_all ON public.product_costs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- anon hat hier nichts zu suchen. Supabase gewährt neuen Tabellen per
-- Vorgabe SELECT an anon/authenticated; ohne passende Policy greift das
-- ohnehin nicht, aber der Blankozugriff gehört trotzdem weg (vgl. das REVOKE
-- in Migration 034).
REVOKE ALL ON public.product_costs FROM anon;

-- -----------------------------------------------------------------------------
-- 2. Journalspalte
--
-- Wie unit_price und retail_price dort: NULL heißt "diese Buchung hat den
-- Preis nicht angefasst". product_costs hält nur den letzten Wert; ohne das
-- Journal ließe sich die Marge einer vergangenen Lieferung nicht nachrechnen.
--
-- Eine eigene RLS braucht es nicht: stock_entries ist seit Migration 030
-- vollständig admin-only.
-- -----------------------------------------------------------------------------

ALTER TABLE public.stock_entries
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2)
    CHECK (cost_price IS NULL OR cost_price >= 0);

COMMENT ON COLUMN public.stock_entries.cost_price IS
  'Einkaufspreis, den diese Buchung gesetzt hat. NULL = unverändert gelassen.';

-- -----------------------------------------------------------------------------
-- 3. record_stock_entries – cost_price mitführen
--
-- Unverändert gegenüber Migration 030, bis auf drei Stellen: cost_price aus
-- dem JSON lesen, bei gesetztem Wert product_costs schreiben, den Wert in die
-- Journalzeile übernehmen. Die Regel "leeres Feld heißt unverändert" gilt
-- damit für alle drei Preise gleich.
--
-- p_items: [{"product_id":"uuid"|null,     -- null = neuer Artikel
--            "name":"...",                 -- Pflicht bei neuen Artikeln
--            "barcode":"..."|null,
--            "category_id":"uuid"|null,    -- Pflicht bei neuen Artikeln
--            "quantity":12,
--            "unit_price":1.50|null,       -- Großhandel, kleinste Staffel
--            "retail_price":2.90|null,     -- Ladenpreis
--            "cost_price":0.95|null},      -- Einkauf, nur intern
--           ...]
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_stock_entries(
  p_items JSONB,
  p_note  TEXT DEFAULT NULL
)
RETURNS SETOF public.stock_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row       RECORD;
  v_product   public.products;
  v_note      TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_sku       TEXT;
  v_barcode   TEXT;
  v_name      TEXT;
  v_before    INT;
  v_after     INT;
  v_variant   UUID;
  v_neu       BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Es wurde nichts erfasst.';
  END IF;

  FOR v_row IN
    SELECT NULLIF(item ->> 'product_id', '')::UUID  AS product_id,
           btrim(COALESCE(item ->> 'name', ''))     AS name,
           NULLIF(btrim(COALESCE(item ->> 'barcode', '')), '') AS barcode,
           NULLIF(item ->> 'category_id', '')::UUID AS category_id,
           (item ->> 'quantity')::INT               AS quantity,
           NULLIF(item ->> 'unit_price', '')::NUMERIC   AS unit_price,
           NULLIF(item ->> 'retail_price', '')::NUMERIC AS retail_price,
           NULLIF(item ->> 'cost_price', '')::NUMERIC   AS cost_price
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity = 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;
    IF v_row.unit_price IS NOT NULL AND v_row.unit_price < 0 THEN
      RAISE EXCEPTION 'Ungültiger Großhandelspreis.';
    END IF;
    IF v_row.retail_price IS NOT NULL AND v_row.retail_price < 0 THEN
      RAISE EXCEPTION 'Ungültiger Ladenpreis.';
    END IF;
    IF v_row.cost_price IS NOT NULL AND v_row.cost_price < 0 THEN
      RAISE EXCEPTION 'Ungültiger Einkaufspreis.';
    END IF;

    v_neu := v_row.product_id IS NULL;

    IF v_neu THEN
      -- --------------------------------------------------------- Neuanlage
      IF v_row.name = '' THEN
        RAISE EXCEPTION 'Ein neuer Artikel braucht eine Bezeichnung.';
      END IF;
      IF v_row.category_id IS NULL THEN
        RAISE EXCEPTION 'Für "%" fehlt die Warengruppe.', v_row.name;
      END IF;
      IF v_row.quantity < 0 THEN
        RAISE EXCEPTION 'Ein neuer Artikel kann keinen negativen Bestand haben.';
      END IF;

      -- Der Barcode könnte inzwischen vergeben sein: der Scan lief im Browser,
      -- gebucht wird erst jetzt.
      IF v_row.barcode IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.products WHERE barcode = v_row.barcode) THEN
        RAISE EXCEPTION 'Der Barcode % ist bereits vergeben.', v_row.barcode;
      END IF;

      -- Die Artikelnummer kommt immer aus dem Nummernkreis der Warengruppe,
      -- nie aus dem Formular: next_sku() sperrt dazu die Kategoriezeile.
      v_sku := public.next_sku(v_row.category_id);

      INSERT INTO public.products (
        category_id, sku, barcode, name, is_active,
        stock_available, retail_price, created_by
      )
      VALUES (
        v_row.category_id, v_sku, v_row.barcode, v_row.name, true,
        v_row.quantity, v_row.retail_price, auth.uid()
      )
      RETURNING * INTO v_product;

      -- Eine Staffel ab 1 Stück, sonst hätte der Artikel im Shop keinen Preis.
      INSERT INTO public.product_variants (product_id, min_quantity, max_quantity, unit_price)
      VALUES (v_product.id, 1, NULL, COALESCE(v_row.unit_price, 0));

      v_before := 0;
      v_after  := v_row.quantity;
      v_name   := v_product.name;
      v_barcode := v_product.barcode;

    ELSE
      -- ------------------------------------------------------------- Zugang
      SELECT * INTO v_product
      FROM public.products
      WHERE id = v_row.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Artikel nicht gefunden.';
      END IF;

      v_before := v_product.stock_available;
      v_after  := v_before + v_row.quantity;

      IF v_after < 0 THEN
        RAISE EXCEPTION 'Von "%" sind nur % Stück im Bestand.',
          v_product.name, v_before;
      END IF;

      UPDATE public.products
      SET stock_available = v_after,
          -- Bezeichnung nur überschreiben, wenn eine mitkommt: das Feld ist im
          -- Erfassungsformular vorbelegt und darf dort auch korrigiert werden.
          name            = CASE WHEN v_row.name <> '' THEN v_row.name ELSE name END,
          -- Ein Artikel ohne Etikett bekommt beim ersten Scan seinen Barcode.
          barcode         = COALESCE(v_row.barcode, barcode),
          retail_price    = COALESCE(v_row.retail_price, retail_price)
      WHERE id = v_product.id;

      IF v_row.unit_price IS NOT NULL THEN
        SELECT id INTO v_variant
        FROM public.product_variants
        WHERE product_id = v_product.id
        ORDER BY min_quantity
        LIMIT 1;

        IF v_variant IS NULL THEN
          INSERT INTO public.product_variants (product_id, min_quantity, max_quantity, unit_price)
          VALUES (v_product.id, 1, NULL, v_row.unit_price);
        ELSE
          UPDATE public.product_variants
          SET unit_price = v_row.unit_price
          WHERE id = v_variant;
        END IF;
      END IF;

      v_sku     := v_product.sku;
      v_name    := CASE WHEN v_row.name <> '' THEN v_row.name ELSE v_product.name END;
      v_barcode := COALESCE(v_row.barcode, v_product.barcode);
    END IF;

    -- Einkaufspreis: nur schreiben, wenn einer mitkam. Ein leeres Feld heißt
    -- "unverändert" und darf den gepflegten Wert nicht auf 0 setzen. Steht
    -- hinter der Neuanlage *und* dem Zugang, weil es für beide gleich gilt.
    IF v_row.cost_price IS NOT NULL THEN
      INSERT INTO public.product_costs (product_id, cost_price, updated_at)
      VALUES (v_product.id, v_row.cost_price, now())
      ON CONFLICT (product_id) DO UPDATE
        SET cost_price = EXCLUDED.cost_price,
            updated_at = now();
    END IF;

    -- INSERT als datenverändernder CTE: RETURN QUERY erwartet eine Abfrage,
    -- ein nacktes INSERT ... RETURNING nimmt es nicht an.
    RETURN QUERY
    WITH gebucht AS (
      INSERT INTO public.stock_entries (
        product_id, product_name, product_sku, barcode,
        quantity, stock_before, stock_after,
        unit_price, retail_price, cost_price, is_new_product, note, created_by
      )
      VALUES (
        v_product.id, v_name, v_sku, v_barcode,
        v_row.quantity, v_before, v_after,
        v_row.unit_price, v_row.retail_price, v_row.cost_price,
        v_neu, v_note, auth.uid()
      )
      RETURNING *
    )
    SELECT * FROM gebucht;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_entries(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_entries(JSONB, TEXT) TO authenticated;
