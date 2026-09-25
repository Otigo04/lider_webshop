-- =============================================================================
-- Migration 041 – Wartungsmodus
--
-- Solange der Webshop in Eigenentwicklung ist, sollen unregistrierte
-- Besucher einen Wartungsscreen statt der echten Seiten sehen. Bestandskunden
-- und Admin müssen sich weiterhin anmelden können – der Schalter greift nur
-- für anonyme Anfragen (siehe proxy.ts).
--
-- Der Schalter steht in company_settings statt in einer eigenen Tabelle: es
-- ist ein einzelnes Flag für den ganzen Betrieb, genau wie pos_vat_rate oder
-- pos_prices_gross – keine eigene Tabelle für eine Spalte.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false;

-- Der Proxy läuft ohne Sitzung (anonyme Besucher haben noch kein Konto) und
-- braucht trotzdem den Schalterstand. company_settings selbst bleibt nur für
-- Angemeldete lesbar (Bankdaten) – diese Funktion gibt gezielt nur das eine
-- Bit heraus, wie public_company_contact() in Migration 036.
CREATE OR REPLACE FUNCTION public.public_maintenance_status()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT maintenance_mode FROM public.company_settings WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_maintenance_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_maintenance_status() TO anon, authenticated;
