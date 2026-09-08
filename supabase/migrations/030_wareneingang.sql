-- =============================================================================
-- Migration 030 – Wareneingang (Bestandsaufnahme)
--
-- Wenn eine Lieferung kommt, wird nicht "ein Artikel bearbeitet", sondern eine
-- Kiste nach der anderen über den Scanner gezogen. Bekannte Ware bekommt nur
-- eine Stückzahl dazu, unbekannte wird im selben Zug angelegt. Beides ist
-- derselbe Vorgang und läuft deshalb durch dieselbe Funktion.
--
-- Warum eine eigene Tabelle statt eines UPDATE auf products.stock_available:
-- der Bestand ist eine Zahl ohne Gedächtnis. Nach der dritten Lieferung der
-- Woche will man wissen, wann welche Menge zu welchem Preis hereinkam – und
-- ein Zahlendreher beim Erfassen ist nur nachvollziehbar, wenn die Buchung
-- selbst irgendwo steht.
--
-- Enthalten:
--   1. stock_entries            – Journal der Zugänge
--   2. RLS                      – Wareneingang ist Personal, nicht Kundschaft
--   3. record_stock_entries()   – Zugang buchen, Preise pflegen, Neue anlegen
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Journal
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Wie bei pos_sale_items: Name und Nummer als Schnappschuss. Ein später
  -- gelöschter Artikel darf die Wareneingangshistorie nicht unlesbar machen.
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  product_sku   TEXT NOT NULL,
  barcode       TEXT,
  -- Zugang ist positiv, eine Korrektur nach unten negativ. Null wäre keine
  -- Buchung, sondern ein Versehen.
  quantity      INT NOT NULL CHECK (quantity <> 0),
  stock_before  INT NOT NULL CHECK (stock_before >= 0),
  stock_after   INT NOT NULL CHECK (stock_after >= 0),
  -- Was bei dieser Aufnahme als Preis gesetzt wurde; NULL = unverändert
  -- gelassen. Der geltende Preis steht weiter am Artikel, hier steht nur,
  -- was der Wareneingang daran geändert hat.
  unit_price    NUMERIC(10, 2) CHECK (unit_price >= 0),
  retail_price  NUMERIC(10, 2) CHECK (retail_price >= 0),
  -- Der Artikel entstand mit dieser Buchung – die Zeile ist dann zugleich
  -- seine Anlage.
  is_new_product BOOLEAN NOT NULL DEFAULT false,
  note          TEXT,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_entries_created
  ON public.stock_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_entries_product
  ON public.stock_entries (product_id);

-- -----------------------------------------------------------------------------
-- 2. RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_entries_admin_all ON public.stock_entries;

CREATE POLICY stock_entries_admin_all ON public.stock_entries
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. record_stock_entries – eine Lieferung in einem Rutsch
--
-- Alle Zeilen in einer Transaktion: eine halb gebuchte Lieferung wäre
-- schlimmer als eine gar nicht gebuchte, weil niemand wüsste, wo sie abbrach.
-- Der Bestand wird unter Zeilensperre gelesen und geschrieben, damit eine
-- gleichzeitige Kassenbuchung nicht überschrieben wird.
--
-- p_items: [{"product_id":"uuid"|null,     -- null = neuer Artikel
--            "name":"...",                 -- Pflicht bei neuen Artikeln
--            "barcode":"..."|null,
--            "category_id":"uuid"|null,    -- Pflicht bei neuen Artikeln
--            "quantity":12,
--            "unit_price":1.50|null,       -- Großhandel, kleinste Staffel
--            "retail_price":2.90|null},    -- Ladenpreis
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
           NULLIF(item ->> 'retail_price', '')::NUMERIC AS retail_price
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

    -- INSERT als datenverändernder CTE: RETURN QUERY erwartet eine Abfrage,
    -- ein nacktes INSERT ... RETURNING nimmt es nicht an.
    RETURN QUERY
    WITH gebucht AS (
      INSERT INTO public.stock_entries (
        product_id, product_name, product_sku, barcode,
        quantity, stock_before, stock_after,
        unit_price, retail_price, is_new_product, note, created_by
      )
      VALUES (
        v_product.id, v_name, v_sku, v_barcode,
        v_row.quantity, v_before, v_after,
        v_row.unit_price, v_row.retail_price, v_neu, v_note, auth.uid()
      )
      RETURNING *
    )
    SELECT * FROM gebucht;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_entries(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_entries(JSONB, TEXT) TO authenticated;
