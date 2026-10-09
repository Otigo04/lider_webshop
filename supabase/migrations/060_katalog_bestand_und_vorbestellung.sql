-- =============================================================================
-- 060: Kataloge – verfügbare Menge und „Bald im Sortiment"
--
-- 1. catalogs.zeige_bestand: die frei verfügbare Menge steht beim Artikel.
--    Standard an. Der Katalog gilt Wochen, der Lagerstand Stunden – gedruckt
--    wird die Menge zum Zeitpunkt der Ausgabe, der Stand steht in der Fußzeile.
-- 2. catalog_items.bald: der Artikel gehört in den Abschnitt „Bald im
--    Sortiment – jetzt vorbestellen". Ein Merkmal der Zusammenstellung, nicht
--    des Artikels: derselbe Artikel kann im nächsten Heft normal erscheinen,
--    sobald er da ist. Fotos und Preise kommen wie immer aus dem Artikelstamm.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS zeige_bestand BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.catalogs.zeige_bestand IS
  'Frei verfügbare Menge beim Artikel drucken (Migration 060).';

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS bald BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.catalog_items.bald IS
  'Artikel steht im Abschnitt „Bald im Sortiment – jetzt vorbestellen" (Migration 060).';
