-- =============================================================================
-- Migration 045 – Impressum aus den Einstellungen, Ladenpreis als Rabattbezug
--
-- 1. company_settings.impressum: das Impressum stand als Platzhaltertext im
--    Quelltext. Jetzt ist es eine Liste von Abschnitten (Titel + Text), die
--    unter /admin/settings gepflegt wird. Im Text stehen Platzhalter wie
--    {firma} oder {anschrift}, die beim Anzeigen aus den Firmendaten gefüllt
--    werden – eine neue Adresse muss so nur an einer Stelle geändert werden.
--    NULL heißt „nie gepflegt": die Seite zeigt dann die Vorlage aus
--    lib/impressum.ts.
--
-- 2. Rabattbezug: list_price ist der Vorher-Preis im Laden. Verglichen wurde er
--    bisher mit dem Großhandelspreis – aus 9,99 → 8,99 im Laden wurde im Shop
--    „−55 %", weil dort 4,50 netto stand. Die Ersparnis rechnet jetzt gegen den
--    Ladenpreis (lib/pricing.ts, reduzierung()); der Shop überträgt den
--    Prozentsatz auf seinen Großhandelspreis. Dafür braucht auch das
--    Schaufenster den Ladenpreis – aber nur von Artikeln mit Streichpreis:
--    deren Preis steht ohnehin rot am Regal. Alle anderen Ladenpreise bleiben
--    intern (Migration 022).
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Impressum
-- -----------------------------------------------------------------------------

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS impressum JSONB
    CHECK (impressum IS NULL OR jsonb_typeof(impressum) = 'array'),
  ADD COLUMN IF NOT EXISTS register_court  TEXT,
  ADD COLUMN IF NOT EXISTS register_number TEXT;

COMMENT ON COLUMN public.company_settings.impressum IS
  'Impressum als [{"titel":"…","text":"…"}]. Platzhalter {firma}, {anschrift} usw. siehe lib/impressum.ts. NULL = Vorlage.';

-- Das Impressum ist öffentlich, Bankdaten und Steuernummer nicht. Deshalb eine
-- eigene Auskunft statt company_settings für anon zu öffnen. Die USt-IdNr.
-- gehört ins Impressum (§ 5 DDG) und wird hier mit herausgegeben, die
-- Steuernummer nicht.
DROP FUNCTION IF EXISTS public.public_impressum();

CREATE FUNCTION public.public_impressum()
RETURNS TABLE (
  impressum       JSONB,
  company_name    TEXT,
  owner_name      TEXT,
  address_street  TEXT,
  address_zip     TEXT,
  address_city    TEXT,
  address_country TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  vat_id          TEXT,
  register_court  TEXT,
  register_number TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT impressum, company_name, owner_name, address_street, address_zip,
         address_city, address_country, phone, email, website, vat_id,
         register_court, register_number
  FROM public.company_settings
  WHERE id = true;
$$;

REVOKE ALL ON FUNCTION public.public_impressum() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_impressum() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. product_price_range um den Rabattbezug erweitern
--
--    sale_base = Ladenpreis, aber nur bei Artikeln mit Streichpreis. Neue
--    Spalte am Ende; RETURNS TABLE lässt sich nicht per REPLACE ändern, also
--    View und Funktion neu.
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.product_price_range;
DROP FUNCTION IF EXISTS public._product_price_range();

CREATE FUNCTION public._product_price_range()
RETURNS TABLE (
  product_id         UUID,
  min_unit_price     NUMERIC,
  max_unit_price     NUMERIC,
  min_order_quantity INT,
  tier_count         BIGINT,
  sale_base          NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id                AS product_id,
    MIN(v.unit_price)   AS min_unit_price,
    MAX(v.unit_price)   AS max_unit_price,
    MIN(v.min_quantity) AS min_order_quantity,
    COUNT(*)            AS tier_count,
    CASE WHEN p.list_price IS NOT NULL THEN p.retail_price END AS sale_base
  FROM public.products p
  JOIN public.product_variants v ON v.product_id = p.id
  WHERE p.is_active
  GROUP BY p.id;
$$;

REVOKE ALL ON FUNCTION public._product_price_range() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._product_price_range() TO anon, authenticated;

CREATE VIEW public.product_price_range
WITH (security_invoker = true) AS
SELECT * FROM public._product_price_range();

GRANT SELECT ON public.product_price_range TO anon, authenticated;
