-- =============================================================================
-- 053: Kataloge – Artikel ohne Foto in der Liste
--
-- Ein Katalog ließ bisher jeden Artikel ohne Foto weg. Für die Listenansicht
-- ist das zu streng: eine Zeile trägt auch ohne Bild, und wer eine
-- Preisliste druckt, will alle Artikel drin haben, nicht nur die fotografierten.
-- Kacheln und Groß bleiben bei der Regel – dort bliebe ein großes leeres Feld.
-- =============================================================================

ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS auch_ohne_foto BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.catalogs.auch_ohne_foto IS
  'Nur Layout „liste": Artikel ohne Foto werden mit leerer Bildfläche gedruckt, statt wegzufallen.';
