-- =============================================================================
-- Migration 044 – Eigener Titel für den Wartungsscreen
--
-- "Hier entsteht etwas Großes." stand fest im Code, wie Nachricht und Datum
-- vor Migration 043 – derselbe Fehler, nur für die Überschrift statt den
-- Fließtext. Gleiches Muster: Spalte an company_settings, Feld in
-- public_maintenance_status() ergänzt. Rückgabespalten geändert → DROP vor
-- CREATE, wie in 042 und 043.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS maintenance_title TEXT;

DROP FUNCTION IF EXISTS public.public_maintenance_status();

CREATE FUNCTION public.public_maintenance_status()
RETURNS TABLE (
  enabled BOOLEAN,
  title   TEXT,
  message TEXT,
  until   DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT maintenance_mode, maintenance_title, maintenance_message, maintenance_until
  FROM public.company_settings
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_maintenance_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_maintenance_status() TO anon, authenticated;
