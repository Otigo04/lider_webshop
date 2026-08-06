-- =============================================================================
-- Migration 007 – Strukturierte Adressfelder statt Freitext
--
-- Migration 005 hatte Rechnungs-/Versandadresse als je ein Freitextfeld
-- angelegt. Zu knapp für ein echtes Formular – jetzt einzelne Felder
-- (Straße, PLZ, Ort, Land) auf users und access_requests. Betrifft nur
-- Felder aus Migration 005, die noch nirgends befüllt sind (Feature war
-- noch nicht live) – deshalb hier ohne Datenmigration.
--
-- Im Supabase SQL Editor ausführen. Idempotent, solange billing_address/
-- shipping_address noch keine echten Daten enthalten (sonst vorher sichern).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kundenkonto
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_street   TEXT,
  ADD COLUMN IF NOT EXISTS billing_zip      TEXT,
  ADD COLUMN IF NOT EXISTS billing_city     TEXT,
  ADD COLUMN IF NOT EXISTS billing_country  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_street  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_zip     TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city    TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS billing_address,
  DROP COLUMN IF EXISTS shipping_address;

-- -----------------------------------------------------------------------------
-- 2. Zugangsanfragen
-- -----------------------------------------------------------------------------

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS billing_street   TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS billing_zip      TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS billing_city     TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS billing_country  TEXT NOT NULL DEFAULT 'Deutschland',
  ADD COLUMN IF NOT EXISTS shipping_street  TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS shipping_zip     TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS shipping_city    TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT NOT NULL DEFAULT 'Deutschland';

ALTER TABLE public.access_requests
  DROP COLUMN IF EXISTS billing_address,
  DROP COLUMN IF EXISTS shipping_address;
