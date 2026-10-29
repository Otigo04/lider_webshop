-- =============================================================================
-- 082 – Push-Abos der Admin-Geräte
--
-- Jedes Gerät (iPhone, Mac …), das Benachrichtigungen für neue Bestellungen und
-- neue Kunden bekommen soll, hat eine Zeile. Die Schalter liegen am Gerät:
-- Handy an, Mac aus ist möglich.
--
-- Angelegt wird über die Server Action abonniere() (Service-Key), gelesen und
-- geändert von den Admin-Einstellungen unter /account. RLS: ein Admin sieht und
-- ändert nur seine eigenen Zeilen. Der Versand läuft mit dem Service-Key und
-- filtert selbst auf role = 'admin' und is_active (lib/push-ziele.ts).
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  geraet         TEXT NOT NULL,
  bei_bestellung BOOLEAN NOT NULL DEFAULT true,
  bei_neukunde   BOOLEAN NOT NULL DEFAULT true,
  zuletzt_ok     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_eigene ON public.push_subscriptions;
CREATE POLICY push_subscriptions_eigene ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
