-- =============================================================================
-- Migration 033 – Artikelgruppen (Ausführungen eines Angebots)
--
-- Eine LED-Lampe gibt es in 60 W und 100 W, warmweiß und kaltweiß. Das sind
-- vier Artikel: vier Etiketten, vier Barcodes, vier Bestände, womöglich vier
-- Preise. Im Regal stehen sie nebeneinander, im Shop sind sie **ein** Angebot,
-- in dem der Kunde auswählt.
--
-- Genau das trennt diese Migration von Migration 032: dort beschreiben
-- Merkmale einen Artikel („dieser Karton ist rot"), hier bündeln sie mehrere
-- zu einer Kaufentscheidung („rot oder blau?"). Die Tabellen von 032 bleiben
-- unverändert und sind die Grundlage – aus den Merkmalswerten der Mitglieder
-- entstehen die Auswahlfelder auf der Artikelseite.
--
-- Warum eine eigene Gruppentabelle und kein `parent_id` auf products:
-- bei einem Kopfartikel wäre eine Ausführung privilegiert. Wer sie löscht –
-- weil die 60-W-Variante ausläuft –, ließe die übrigen ohne Titel zurück.
-- Die Gruppe trägt den gemeinsamen Namen, die Mitglieder sind gleichberechtigt.
--
-- Was sich *nicht* ändert: eine Ausführung ist ein ganz normaler Artikel.
-- Kasse, Wareneingang, Bestand, Bestellung und Rechnung sehen keinen
-- Unterschied und mussten deshalb nicht angefasst werden.
--
-- Enthalten:
--   1. product_groups             – der gemeinsame Titel
--   2. products.group_id          – Zugehörigkeit
--   3. products_public            – group_id auch ohne Anmeldung
--   4. RLS
--   5. create_group_products()    – Kombinationen in einem Rutsch anlegen
--
-- Im Supabase SQL Editor ausführen. Idempotent. Setzt Migration 032 voraus.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Gruppe
--
-- Sie trägt nur, was allen Ausführungen gemeinsam ist: Titel und
-- Beschreibungstext. Preis, Bestand, Barcode, Fotos bleiben am einzelnen
-- Artikel – dort unterscheiden sie sich ja gerade.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Zugehörigkeit
--
-- ON DELETE SET NULL: wird eine Gruppe aufgelöst, bleiben ihre Artikel
-- bestehen und stehen wieder einzeln im Sortiment. Ein CASCADE hier hieße,
-- dass das Löschen einer Überschrift vier verkäufliche Artikel samt
-- Bestellhistorie mitnimmt.
-- -----------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES public.product_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_group ON public.products (group_id);

COMMENT ON COLUMN public.products.group_id IS
  'Artikelgruppe (Migration 033). NULL = einzelner Artikel ohne Ausführungen.';

-- -----------------------------------------------------------------------------
-- 3. products_public
--
-- Das Schaufenster muss die Zugehörigkeit kennen, sonst stünden im Sortiment
-- ohne Anmeldung vier Kacheln derselben Lampe. Neue Spalte ans Ende:
-- CREATE OR REPLACE VIEW darf bestehende Spalten weder umbenennen noch
-- umsortieren (42P16, siehe Migration 009).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at,
       is_new, is_topseller, has_image, list_price, group_id
FROM public.products
WHERE is_active = true AND has_image = true;

GRANT SELECT ON public.products_public TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. RLS
--
-- Wie bei den Merkmalen: der Gruppenname steht im Schaufenster, lesen darf
-- ihn deshalb jeder. Geschrieben wird nur aus der Verwaltung.
-- -----------------------------------------------------------------------------

ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_groups_read  ON public.product_groups;
DROP POLICY IF EXISTS product_groups_admin ON public.product_groups;

CREATE POLICY product_groups_read ON public.product_groups
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY product_groups_admin ON public.product_groups
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.product_groups TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. create_group_products – alle Kombinationen auf einmal
--
-- Vier Ausführungen von Hand anzulegen heißt: viermal dasselbe Formular,
-- viermal dieselbe Beschreibung, und beim dritten Mal ist ein Preis vertippt.
-- Der Generator im Adminbereich rechnet die Kombinationen aus, diese Funktion
-- legt sie an – in **einer** Transaktion.
--
-- Warum das nicht die Anwendung Zeile für Zeile macht: jede Ausführung braucht
-- eine Artikelnummer aus dem Nummernkreis (next_sku sperrt die Kategoriezeile),
-- eine Preisstaffel und ihre Merkmalsverknüpfungen. Bricht das nach der
-- zweiten Zeile ab, stünden zwei halbe Ausführungen im Sortiment und der
-- Nummernkreis wäre bereits weitergezählt.
--
-- p_group_id: NULL = neue Gruppe anlegen, sonst Ausführungen nachlegen.
-- p_items: [{"name":"LED-Lampe E27 60W warmweiß",
--            "barcode":"..."|null,
--            "value_ids":["uuid", ...],     -- Merkmalswerte dieser Ausführung
--            "unit_price":4.99,             -- Großhandel, Staffel ab 1 Stück
--            "retail_price":6.99|null,
--            "list_price":8.99|null,
--            "stock":120}, ...]
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_group_products(
  p_group_id    UUID,
  p_name        TEXT,
  p_description TEXT,
  p_category_id UUID,
  p_items       JSONB
)
RETURNS public.product_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group   public.product_groups;
  v_row     RECORD;
  v_product public.products;
  v_sku     TEXT;
  v_name    TEXT := NULLIF(btrim(COALESCE(p_name, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Es wurde keine Ausführung angegeben.';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Die Warengruppe fehlt.';
  END IF;

  -- --------------------------------------------------------------- Gruppe
  IF p_group_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Die Gruppe braucht einen Namen.';
    END IF;

    INSERT INTO public.product_groups (name, description, created_by)
    VALUES (v_name, NULLIF(btrim(COALESCE(p_description, '')), ''), auth.uid())
    RETURNING * INTO v_group;
  ELSE
    SELECT * INTO v_group FROM public.product_groups WHERE id = p_group_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Die Gruppe wurde nicht gefunden.';
    END IF;

    -- Name und Text nur überschreiben, wenn welche mitkommen: beim Nachlegen
    -- weiterer Ausführungen schickt die Oberfläche sie nicht mit.
    IF v_name IS NOT NULL THEN
      UPDATE public.product_groups
      SET name        = v_name,
          description = NULLIF(btrim(COALESCE(p_description, '')), ''),
          updated_at  = now()
      WHERE id = v_group.id
      RETURNING * INTO v_group;
    END IF;
  END IF;

  -- ---------------------------------------------------------- Ausführungen
  FOR v_row IN
    SELECT btrim(COALESCE(item ->> 'name', ''))            AS name,
           NULLIF(btrim(COALESCE(item ->> 'barcode', '')), '') AS barcode,
           NULLIF(item ->> 'unit_price', '')::NUMERIC      AS unit_price,
           NULLIF(item ->> 'retail_price', '')::NUMERIC    AS retail_price,
           NULLIF(item ->> 'list_price', '')::NUMERIC      AS list_price,
           COALESCE(NULLIF(item ->> 'stock', '')::INT, 0)  AS stock,
           COALESCE(item -> 'value_ids', '[]'::JSONB)      AS value_ids
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.name = '' THEN
      RAISE EXCEPTION 'Eine Ausführung ohne Bezeichnung lässt sich nicht anlegen.';
    END IF;
    IF v_row.unit_price IS NULL OR v_row.unit_price < 0 THEN
      RAISE EXCEPTION 'Für "%" fehlt der Großhandelspreis.', v_row.name;
    END IF;
    IF v_row.stock < 0 THEN
      RAISE EXCEPTION 'Für "%" ist der Bestand negativ.', v_row.name;
    END IF;

    -- Der Barcode könnte inzwischen vergeben sein; die Meldung soll sagen,
    -- welcher, und nicht nur „23505".
    IF v_row.barcode IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.products WHERE barcode = v_row.barcode) THEN
      RAISE EXCEPTION 'Der Barcode % ist bereits vergeben.', v_row.barcode;
    END IF;

    v_sku := public.next_sku(p_category_id);

    INSERT INTO public.products (
      category_id, group_id, sku, barcode, name, description,
      is_active, stock_available, retail_price, list_price, created_by
    )
    VALUES (
      p_category_id, v_group.id, v_sku, v_row.barcode, v_row.name,
      v_group.description,
      true, v_row.stock, v_row.retail_price, v_row.list_price, auth.uid()
    )
    RETURNING * INTO v_product;

    -- Staffel ab 1 Stück, sonst hätte die Ausführung im Shop keinen Preis.
    INSERT INTO public.product_variants (product_id, min_quantity, max_quantity, unit_price)
    VALUES (v_product.id, 1, NULL, v_row.unit_price);

    -- Die Merkmalswerte sind das, was diese Ausführung von ihren Geschwistern
    -- unterscheidet – ohne sie stünde sie im Auswahlfeld nirgends.
    INSERT INTO public.product_attribute_links (product_id, value_id)
    SELECT v_product.id, wert::UUID
    FROM jsonb_array_elements_text(v_row.value_ids) AS wert
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_products(UUID, TEXT, TEXT, UUID, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_products(UUID, TEXT, TEXT, UUID, JSONB)
  TO authenticated;

COMMENT ON TABLE public.product_groups IS
  'Bündelt Ausführungen eines Angebots (Migration 033). Die Mitglieder sind normale Artikel mit eigener Nummer, eigenem Bestand und eigenem Preis.';
