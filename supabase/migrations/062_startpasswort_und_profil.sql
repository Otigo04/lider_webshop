-- =============================================================================
-- 062: Startpasswort für den Admin sichtbar, Profil-Erinnerung
--
-- 1. customer_start_passwords: das vom Admin vergebene Startpasswort bleibt
--    verschlüsselt (AES-256-GCM, lib/start-password.ts) liegen, bis der Kunde
--    sein eigenes gesetzt hat. Vorher war es nur im Moment des Anlegens zu
--    sehen; wer den Kunden erst Wochen später erreichte, musste ein neues
--    erzeugen. Beim Setzen des eigenen Passworts wird die Zeile gelöscht
--    (clearMustChangePassword). Kein Zugriff für Browser-Sessions: RLS an,
--    keine Policy – gelesen und geschrieben wird nur serverseitig mit dem
--    Service-Key, nach requireAdmin().
-- 2. users.profil_erinnert_at: der Kunde wurde nach dem ersten Login einmal
--    gebeten, fehlende Angaben nachzutragen (oder hat „später“ gewählt). Die
--    Pflicht vor der ersten Bestellung hängt nicht daran.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_start_passwords (
  user_id      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  password_enc TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_start_passwords ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_start_passwords IS
  'Verschlüsseltes Startpasswort bis zum ersten eigenen Passwort. Nur per Service-Key (Migration 062).';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profil_erinnert_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.profil_erinnert_at IS
  'Kunde wurde einmal gebeten, fehlende Profilangaben zu ergänzen (Migration 062).';
