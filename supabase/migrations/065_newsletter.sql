-- =============================================================================
-- 065: Newsletter
--
-- 1. users.newsletter_abo: Kunden abonnieren selbst (Konto, Registrierung).
--    newsletter_abo_at hält den Zeitpunkt der Einwilligung fest (Nachweis),
--    newsletter_abgemeldet_at den der Abmeldung. Der Admin setzt das Häkchen
--    nie für einen Kunden – die Einwilligung muss vom Kunden kommen.
-- 2. newsletters: ein Newsletter ist ein Dokument aus Bausteinen (blocks, JSON)
--    mit Betreff und Vorschautext. status: draft → sending → sent. Beim Senden
--    wird das fertige HTML in sent_html festgehalten (Archiv, und damit ein
--    unterbrochener Versand allen Empfängern dasselbe schickt).
-- 3. newsletter_deliveries: eine Zeile je Empfänger und Newsletter. Sie macht
--    den Versand fortsetzbar und verhindert doppelte Mails.
--
-- Nur Admins sehen und ändern Newsletter und Zustellungen. Versendet wird mit
-- dem Service-Key (lib/newsletter-senden.ts).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS newsletter_abo           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_abo_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS newsletter_abgemeldet_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_newsletter ON public.users (newsletter_abo) WHERE newsletter_abo;

CREATE TABLE IF NOT EXISTS public.newsletters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT NOT NULL DEFAULT 'Neuer Newsletter',
  preheader   TEXT,
  blocks      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent')),
  sent_html   TEXT,
  sent_at     TIMESTAMPTZ,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  UNIQUE (newsletter_id, email)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_nl
  ON public.newsletter_deliveries (newsletter_id, status);

ALTER TABLE public.newsletters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS newsletters_admin ON public.newsletters;
CREATE POLICY newsletters_admin ON public.newsletters
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS newsletter_deliveries_admin ON public.newsletter_deliveries;
CREATE POLICY newsletter_deliveries_admin ON public.newsletter_deliveries
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletters           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_deliveries TO authenticated;

DROP TRIGGER IF EXISTS trg_newsletters_updated_at ON public.newsletters;
CREATE TRIGGER trg_newsletters_updated_at
  BEFORE UPDATE ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
