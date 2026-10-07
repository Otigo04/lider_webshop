-- =============================================================================
-- 058 – E-Mail-Bestätigung für neue Konten
--
-- Selbstregistrierung und vom Admin angelegte Konten sind inaktiv, bis der
-- Kunde den Link in der Bestätigungsmail klickt. Beim vom Admin angelegten
-- Konto geht die Mail erst auf Knopfdruck raus, und das Startpasswort kommt
-- erst nach dem Klick per Mail. Es liegt bis dahin verschlüsselt in
-- email_verifications.temp_password_enc und wird nach dem Versand gelöscht.
--
-- users.verified_at: NULL = Adresse nicht bestätigt. Bestandskonten gelten
-- als bestätigt.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

UPDATE public.users SET verified_at = created_at WHERE verified_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('selbst', 'admin')),
  token_hash          TEXT UNIQUE,
  sent_at             TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  temp_password_enc   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nur der Service-Key kommt an diese Tabelle: RLS an, keine Policy, kein GRANT.
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_verifications FROM anon, authenticated;
