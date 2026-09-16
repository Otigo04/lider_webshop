-- =============================================================================
-- Migration 036 – Kontaktdaten für Fußzeile und Startseite
--
-- company_settings ist nur für angemeldete Nutzer lesbar (Migration 016), weil
-- dort auch Bankverbindung und Steuernummern stehen. Fußzeile und Startseite
-- zeigen aber Telefon, E-Mail und Anschrift jedem Besucher – bisher als
-- Platzhalter „[TELEFON]", obwohl die Daten gepflegt waren.
--
-- Die Funktion gibt genau diese Kontaktangaben heraus und nichts sonst. Sie
-- stehen ohnehin im Impressum; IBAN, Steuernummer und Kassenvorgaben bleiben
-- hinter der Policy.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.public_company_contact()
RETURNS TABLE (
  company_name   TEXT,
  address_street TEXT,
  address_zip    TEXT,
  address_city   TEXT,
  phone          TEXT,
  email          TEXT,
  website        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_name, address_street, address_zip, address_city, phone, email, website
  FROM public.company_settings
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_company_contact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_company_contact() TO anon, authenticated;
