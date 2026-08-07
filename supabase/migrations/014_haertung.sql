-- =============================================================================
-- Migration 014 – Härtung: E-Mail-Spalte und Missbrauch am Anfrageformular
--
-- Zwei Befunde aus dem Sicherheitsdurchgang:
--
-- 1. protect_user_privileges() schützte role, is_active und id, nicht aber
--    email. users_update_self erlaubt einem Kunden aber UPDATE auf der ganzen
--    Zeile. Er konnte sich damit in public.users eine fremde Adresse
--    eintragen – die Anmeldung läuft zwar über auth.users und blieb
--    unberührt, aber jede Admin-Liste, jede Bestellübersicht und jeder
--    spätere Mailversand hätte die falsche Adresse verwendet.
--    Die Adresse ändert ab jetzt nur der Admin, und zwar über
--    auth.admin.updateUserById, damit auth.users und public.users nicht
--    auseinanderlaufen.
--
-- 2. access_requests nimmt Einträge von anonymen Besuchern an (nötig, das
--    Formular steht auf der Landingpage). Ohne Bremse kann ein Skript die
--    Tabelle fluten und die Admin-Ansicht unbrauchbar machen. Die Grenzen
--    unten sind für echte Interessenten großzügig und für Skripte eng.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. E-Mail gehört zu den geschützten Spalten
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Kein angemeldeter Nutzer = direkter Datenbankzugriff (SQL Editor,
  -- Service-Key). Hat volle Rechte, wird hier nicht zusätzlich beschnitten.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Rolle und Status dürfen nur von Admins geändert werden';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Die E-Mail-Adresse ändert nur der Administrator';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Bremse für das öffentliche Anfrageformular
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.limit_access_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pro_mail INT;
  v_gesamt   INT;
BEGIN
  -- Admins legen im Backend nichts an, aber falls doch: nicht ausbremsen.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_pro_mail
  FROM public.access_requests
  WHERE email = NEW.email AND created_at > now() - INTERVAL '24 hours';

  IF v_pro_mail >= 3 THEN
    RAISE EXCEPTION 'Zu dieser Adresse liegt bereits eine Anfrage vor. Wir melden uns.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_gesamt
  FROM public.access_requests
  WHERE created_at > now() - INTERVAL '1 hour';

  -- 60 Anfragen je Stunde sind für einen Großhandel reichlich; ein Skript
  -- läuft dagegen sofort auf.
  IF v_gesamt >= 60 THEN
    RAISE EXCEPTION 'Derzeit gehen sehr viele Anfragen ein. Bitte später erneut versuchen.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limit_access_requests ON public.access_requests;
CREATE TRIGGER trg_limit_access_requests
  BEFORE INSERT ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.limit_access_requests();

CREATE INDEX IF NOT EXISTS idx_access_requests_email_created
  ON public.access_requests(email, created_at DESC);
