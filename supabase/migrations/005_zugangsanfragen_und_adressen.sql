-- =============================================================================
-- Migration 005 – Konto-Adressen und Zugangsanfragen
--
-- 1. Kunden bekommen Rechnungs- und Versandadresse im eigenen Konto.
-- 2. Neue Tabelle für Zugangsanfragen von der Landingpage: jeder darf eine
--    Anfrage einreichen (kein Login nötig), lesen/bearbeiten dürfen nur
--    Admins.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Adressfelder am Kundenkonto
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_address  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- -----------------------------------------------------------------------------
-- 2. Zugangsanfragen
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.access_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     TEXT NOT NULL,
  contact_name     TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  billing_address  TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'contacted', 'done')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON public.access_requests(status, created_at DESC);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_requests_insert_public ON public.access_requests;
DROP POLICY IF EXISTS access_requests_admin_all      ON public.access_requests;

-- Landingpage-Formular: auch anonyme Besucher dürfen eine Zeile anlegen,
-- aber nichts zurücklesen (kein SELECT-Grant für anon/authenticated hier).
CREATE POLICY access_requests_insert_public ON public.access_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY access_requests_admin_all ON public.access_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
