-- =============================================================================
-- Migration 037 – Versandkostenfreigrenze in die Firmendaten
--
-- Die Grenze stand als Konstante FREE_SHIPPING_THRESHOLD im Code, der
-- Hinweisleisten-Text dagegen in site_banners. Beide sagten dem Kunden auf
-- derselben Seite eine andere Zahl (100 € im Warenkorb, 300 € in der Leiste).
-- Eine Zusage über Versandkosten ist eine Betriebsentscheidung und gehört
-- deshalb neben Steuersatz und Zahlungsziel in company_settings, wo sie sich
-- unter /admin/settings ändern lässt.
--
-- Die Grenze ist zugleich Werbung: sie steht auf der Startseite und der
-- Versandseite, die auch ohne Anmeldung erreichbar sind. Deshalb reicht
-- public_company_contact() sie mit heraus – anders als Bankverbindung und
-- Steuernummern, die hinter der Policy bleiben.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Spalte
--
-- DEFAULT 300: das ist der Wert, der bisher in der Hinweisleiste stand und
-- damit die Zusage, die Kunden gelesen haben. Bestehende Zeilen bekommen ihn
-- beim Hinzufügen der Spalte automatisch.
-- -----------------------------------------------------------------------------

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS free_shipping_threshold NUMERIC(10, 2)
    NOT NULL DEFAULT 300
    CHECK (free_shipping_threshold >= 0);

COMMENT ON COLUMN public.company_settings.free_shipping_threshold IS
  'Netto-Warenwert, ab dem der Versand kostenfrei ist. 0 = immer kostenfrei.';

-- -----------------------------------------------------------------------------
-- 2. Öffentliche Kontaktauskunft um die Grenze erweitern
--
-- Gleiche Funktion wie in Migration 036, nur eine Spalte mehr. Der Rückgabetyp
-- ändert sich damit, deshalb muss die alte Fassung vorher weg – CREATE OR
-- REPLACE kann RETURNS TABLE nicht umdefinieren.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.public_company_contact();

CREATE FUNCTION public.public_company_contact()
RETURNS TABLE (
  company_name            TEXT,
  address_street          TEXT,
  address_zip             TEXT,
  address_city            TEXT,
  phone                   TEXT,
  email                   TEXT,
  website                 TEXT,
  free_shipping_threshold NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_name, address_street, address_zip, address_city,
         phone, email, website, free_shipping_threshold
  FROM public.company_settings
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_company_contact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_company_contact() TO anon, authenticated;
