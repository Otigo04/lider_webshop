-- =============================================================================
-- Migration 043 – Eigene Nachricht und Datum für den Wartungsscreen
--
-- Der Text auf /wartung stand bisher fest im Code. Admin soll ihn unter
-- /admin/settings ändern können, dazu optional ein Datum ("voraussichtlich
-- verfügbar ab"). Beides ist wie maintenance_mode selbst kein eigener
-- Datensatz, sondern ein Feld am Betrieb – company_settings ist singleton.
--
-- public_maintenance_status() gab bisher nur das Bit heraus, das der Proxy
-- für anonyme Besucher braucht. Jetzt liefert sie zusätzlich Nachricht und
-- Datum, damit /wartung sie ohne Sitzung über denselben Weg lesen kann wie
-- Kontaktdaten über public_company_contact(). Rückgabespalten geändert →
-- DROP vor CREATE, wie in Migration 042.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_until DATE;

DROP FUNCTION IF EXISTS public.public_maintenance_status();

CREATE FUNCTION public.public_maintenance_status()
RETURNS TABLE (
  enabled BOOLEAN,
  message TEXT,
  until   DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT maintenance_mode, maintenance_message, maintenance_until
  FROM public.company_settings
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_maintenance_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_maintenance_status() TO anon, authenticated;
