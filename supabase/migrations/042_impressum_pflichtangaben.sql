-- =============================================================================
-- Migration 042 – Vertretungsberechtigte(r) und USt-IdNr. in der öffentlichen
-- Kontaktauskunft
--
-- Impressum und Datenschutzerklärung standen bisher als reiner Platzhaltertext
-- im Code, unabhängig davon, was unter /admin/settings gepflegt war – ein Bug,
-- keine Absicht. Beide Seiten lesen ab jetzt public_company_contact(), die
-- Funktion muss dafür zwei weitere Pflichtangaben nach § 5 DDG herausgeben:
-- Vertretungsberechtigte(r) (owner_name) und die USt-IdNr. (vat_id). Beide
-- gehören ohnehin ins Impressum, sind also kein Sonderfall wie IBAN oder
-- Steuernummer – die bleiben hinter der Policy.
--
-- CREATE OR REPLACE genügt hier nicht: Postgres verbietet das Ändern der
-- Rückgabespalten einer Funktion ohne vorheriges DROP.
-- =============================================================================

DROP FUNCTION IF EXISTS public.public_company_contact();

CREATE FUNCTION public.public_company_contact()
RETURNS TABLE (
  company_name   TEXT,
  owner_name     TEXT,
  address_street TEXT,
  address_zip    TEXT,
  address_city   TEXT,
  phone          TEXT,
  email          TEXT,
  website        TEXT,
  vat_id         TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_name, owner_name, address_street, address_zip, address_city,
         phone, email, website, vat_id
  FROM public.company_settings
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_company_contact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_company_contact() TO anon, authenticated;
