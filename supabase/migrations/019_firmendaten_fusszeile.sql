-- =============================================================================
-- Migration 019 – Kontaktdaten für die Rechnungsfußzeile
--
-- Die Rechnung trägt unten eine breite Fußzeile mit allen Pflicht- und
-- Kontaktangaben (§ 14 UStG, § 5 TMG). Anschrift, Steuernummer, USt-IdNr. und
-- Bankverbindung stehen schon in company_settings – Telefon, E-Mail, Webseite
-- und der Name des Inhabers fehlten und waren nirgends pflegbar.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS owner_name TEXT,   -- Inhaber, z. B. "Inh. Orhan Yılmaz"
  ADD COLUMN IF NOT EXISTS phone      TEXT,
  ADD COLUMN IF NOT EXISTS email      TEXT,
  ADD COLUMN IF NOT EXISTS website    TEXT;

COMMENT ON COLUMN public.company_settings.owner_name IS
  'Name des Inhabers für die Rechnungsfußzeile (ohne den Zusatz "Inh.").';
COMMENT ON COLUMN public.company_settings.website IS
  'Ohne Schema eingeben (www.example.de) – die Rechnung setzt nichts davor.';
