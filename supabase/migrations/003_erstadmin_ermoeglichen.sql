-- =============================================================================
-- Migration 003 – Anlegen des ersten Admins ermöglichen
--
-- Problem: protect_user_privileges() ließ eine Änderung von role/is_active nur
-- zu, wenn is_admin() wahr ist. Im SQL Editor und über den Service-Key ist
-- auth.uid() aber NULL, is_admin() damit false. Solange es keinen Admin gibt,
-- lässt sich also auch keiner anlegen:
--
--   ERROR: P0001: Rolle und Status dürfen nur von Admins geändert werden
--
-- Lösung: Zugriffe ohne angemeldeten Nutzer (auth.uid() IS NULL) durchlassen.
-- Das sind ausschließlich SQL Editor und Service-Key – beides bereits voller
-- Administrationszugriff, der RLS ohnehin umgeht. In der App wird der
-- Service-Key nur hinter requireAdmin() verwendet (lib/supabase/admin.ts).
-- Für angemeldete Kunden bleibt die Sperre unverändert.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

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

  RETURN NEW;
END;
$$;
