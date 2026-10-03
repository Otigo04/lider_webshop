-- =============================================================================
-- Migration 046 – Kundennummern
--
-- Kunden wurden bisher über ihre E-Mail-Adresse identifiziert. Das reicht im
-- Shop, aber nicht am Telefon, nicht auf dem Papier und nicht in der
-- Buchhaltung: eine Rechnung, ein Lieferschein und eine Überweisung brauchen
-- eine kurze, feste Kennung, die sich vorlesen und zuordnen lässt. Eine
-- E-Mail-Adresse ist beides nicht – sie ist lang, sie wechselt, und zwei
-- Mitarbeiter derselben Firma haben zwei davon.
--
-- Format: K + fünf Ziffern, beginnend bei K10001.
--
--  * **Buchstabe vorn**, damit die Nummer nicht mit Bestellnummer
--    (LG-JJJJ-00001), Rechnungsnummer (LDxxxxxxx) oder Artikelnummer
--    (12-0001) verwechselt wird. Wer "zehntausenddrei" ins falsche Feld
--    tippt, findet den falschen Vorgang.
--  * **Start bei 10001** statt bei 1: alle Nummern sind gleich lang, damit
--    taugt die Spalte zum Sortieren und zum Abtippen. Außerdem verrät K10001
--    nicht, dass es der erste Kunde ist.
--  * **Fortlaufend aus einer Sequenz**, nicht aus MAX()+1 wie bei den
--    Artikelnummern: dort werden Nummernkreise je Warengruppe geführt und
--    sollen nach dem Löschen wieder aufgefüllt werden. Eine Kundennummer darf
--    nie ein zweites Mal vergeben werden – sie steht auf gestellten
--    Rechnungen.
--
-- Vergeben wird sie per Trigger, nicht per DEFAULT: ein DEFAULT bekäme auch
-- der Admin, und der ist kein Kunde. Bestandskunden werden nachgezogen, in
-- der Reihenfolge ihrer Anlage – wer am längsten dabei ist, hat die kleinste
-- Nummer.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS customer_number TEXT;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_customer_number_key'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_customer_number_key UNIQUE (customer_number);
  END IF;
END
$do$;

COMMENT ON COLUMN public.users.customer_number IS
  'Kundennummer (K + 5 Ziffern). Steht auf Rechnung, Lieferschein und Beleg. '
  'Wird vom Trigger vergeben und nie wiederverwendet.';

CREATE SEQUENCE IF NOT EXISTS public.customer_number_seq START 10001;

-- -----------------------------------------------------------------------------
-- Bestandskunden nachziehen
--
-- Älteste zuerst, damit die Reihenfolge der Nummern der Reihenfolge der
-- Anlage entspricht. Danach steht die Sequenz hinter der höchsten vergebenen
-- Nummer; der nächste Neukunde schließt lückenlos an.
-- -----------------------------------------------------------------------------

DO $do$
DECLARE
  v_zeile RECORD;
  v_hoechste BIGINT;
BEGIN
  FOR v_zeile IN
    SELECT id FROM public.users
    WHERE role = 'customer' AND customer_number IS NULL
    ORDER BY created_at, id
  LOOP
    UPDATE public.users
    SET customer_number =
      'K' || lpad(nextval('public.customer_number_seq')::TEXT, 5, '0')
    WHERE id = v_zeile.id;
  END LOOP;

  -- Sollten schon Nummern von Hand vergeben worden sein, darf die Sequenz
  -- nicht dahinter zurückfallen – sonst kollidiert der nächste Neukunde.
  SELECT MAX(substring(customer_number FROM 2)::BIGINT)
  INTO v_hoechste
  FROM public.users
  WHERE customer_number ~ '^K[0-9]+$';

  IF v_hoechste IS NOT NULL THEN
    PERFORM setval('public.customer_number_seq', GREATEST(v_hoechste, 10000));
  END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- Vergabe
--
-- BEFORE INSERT OR UPDATE: ein Konto, das vom Admin zum Kunden gemacht wird,
-- braucht ebenso eine Nummer wie ein neu angelegtes. Eine einmal vergebene
-- Nummer bleibt stehen, auch wenn die Rolle später wechselt – sie steht
-- womöglich schon auf einer Rechnung.
--
-- SECURITY DEFINER, weil der Trigger beim Self-Signup im Kontext des
-- Auth-Dienstes läuft und dort kein Recht auf die Sequenz bestünde.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_customer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.customer_number IS NULL AND NEW.role = 'customer' THEN
    NEW.customer_number :=
      'K' || lpad(nextval('public.customer_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS users_customer_number ON public.users;
CREATE TRIGGER users_customer_number
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_customer_number();

GRANT USAGE ON SEQUENCE public.customer_number_seq TO authenticated, service_role;
