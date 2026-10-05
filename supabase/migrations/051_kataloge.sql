-- =============================================================================
-- Migration 051 – Kataloge
--
-- Unter /admin/kataloge werden Artikel zu einem Katalog zusammengestellt und
-- als A4-Dokument ausgegeben – vom Gesamtkatalog bis zum Aktionsheft.
--
-- Gespeichert wird nur, WAS im Katalog steht und WIE er aussehen soll: die
-- Auswahl und die Einstellungen. Preise, Bezeichnungen und Fotos kommen bei
-- jeder Ausgabe frisch aus dem Artikelstamm. Dieselbe Regel wie beim
-- Preisschild: eine abgelegte Kopie wäre eine zweite Wahrheit, die still
-- veraltet – und ein Katalog mit dem Preis von vor drei Wochen ist Papier,
-- das sich nicht zurückholen lässt.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.catalogs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL CHECK (length(trim(title)) > 0),
  -- Zeitraum oder Zusatz: „Oktober 2026", „gültig bis 31.10."
  subtitle           TEXT,
  layout             TEXT NOT NULL DEFAULT 'kacheln'
                     CHECK (layout IN ('liste', 'kacheln', 'gross')),
  stil               TEXT NOT NULL DEFAULT 'sachlich'
                     CHECK (stil IN ('sachlich', 'prospekt')),
  preisart           TEXT NOT NULL DEFAULT 'grosshandel'
                     CHECK (preisart IN ('grosshandel', 'laden', 'ohne')),
  zeige_barcode      BOOLEAN NOT NULL DEFAULT true,
  zeige_beschreibung BOOLEAN NOT NULL DEFAULT false,
  zeige_merkmale     BOOLEAN NOT NULL DEFAULT true,
  zeige_kennzeichen  BOOLEAN NOT NULL DEFAULT true,
  mit_titelseite     BOOLEAN NOT NULL DEFAULT true,
  mit_inhalt         BOOLEAN NOT NULL DEFAULT true,
  -- Jede Warengruppe beginnt auf einer neuen Seite. Kein eigenes Trennblatt:
  -- das wäre je Gruppe ein Blatt Papier ohne Ware.
  mit_trennseiten    BOOLEAN NOT NULL DEFAULT true,
  mit_rueckseite     BOOLEAN NOT NULL DEFAULT true,
  rueckseite_text    TEXT,
  created_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ein Artikel steht je Katalog einmal – deshalb der zusammengesetzte
-- Schlüssel. Ein zweites Hinzufügen ist kein Fehler, sondern wirkungslos.
--
-- CASCADE in beide Richtungen: ohne Katalog ist die Zeile sinnlos, und ein
-- gelöschter Artikel ließe sich ohnehin nicht drucken.
CREATE TABLE IF NOT EXISTS public.catalog_items (
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Reihenfolge innerhalb der Warengruppe. Die Gruppen selbst folgen
  -- categories.order_index.
  position   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (catalog_id, product_id)
);

CREATE INDEX IF NOT EXISTS catalog_items_reihenfolge
  ON public.catalog_items (catalog_id, position);

ALTER TABLE public.catalogs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogs_admin      ON public.catalogs;
DROP POLICY IF EXISTS catalog_items_admin ON public.catalog_items;

-- Nur der Admin: ein Katalogentwurf ist Betriebsinterna, bis er gedruckt ist.
CREATE POLICY catalogs_admin ON public.catalogs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY catalog_items_admin ON public.catalog_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogs      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items TO authenticated;

COMMENT ON TABLE public.catalogs IS
  'Gespeicherte Kataloge – Auswahl und Einstellungen, gepflegt unter /admin/kataloge.';
COMMENT ON TABLE public.catalog_items IS
  'Artikel eines Katalogs. Preise und Fotos kommen bei der Ausgabe aus dem Artikelstamm.';
