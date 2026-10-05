-- =============================================================================
-- 052: Kataloge – reduzierte Ware als eigener Abschnitt vorn
--
-- Reduzierte Artikel standen bisher mitten in ihrer Warengruppe. Wer ein
-- Aktionsheft druckt, will sie zusammen und vorn: ein Blatt „Reduziert", dann
-- das Sortiment. Gespeichert wird nur der Schalter – welche Artikel reduziert
-- sind, entscheidet beim Druck reduzierung() aus dem Artikelstamm, nicht eine
-- abgelegte Liste, die still veraltet.
-- =============================================================================

ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS reduziert_zuerst BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.catalogs.reduziert_zuerst IS
  'Reduzierte Artikel erscheinen gesammelt in einem Abschnitt „Reduziert" vor den Warengruppen.';
