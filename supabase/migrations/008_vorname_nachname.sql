-- =============================================================================
-- Migration 008 – Vorname/Nachname statt "Ansprechpartner"
--
-- access_requests.contact_name war ein einzelnes Freitextfeld ("Ansprech-
-- partner"). Ersetzt durch first_name/last_name, konsistent mit einem
-- klassischen Formular. Betroffene Spalte ist noch leer (Feature nicht
-- live) – keine Datenmigration nötig.
--
-- Im Supabase SQL Editor ausführen. Idempotent, solange contact_name noch
-- keine echten Daten enthält.
-- =============================================================================

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS last_name  TEXT NOT NULL;

ALTER TABLE public.access_requests
  DROP COLUMN IF EXISTS contact_name;
