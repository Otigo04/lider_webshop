-- =============================================================================
-- Migration 071 – Öffnungszeiten
--
-- 1. company_settings.opening_hours: sieben Einträge, Index 0 = Montag, je
--    {"open":"HH:MM","close":"HH:MM"} oder null (geschlossen).
-- 2. public_opening_hours(): dieselbe Angabe für Besucher ohne Konto.
--    company_settings selbst bleibt nur für Angemeldete lesbar;
--    public_company_contact() behält seinen Rückgabetyp.
-- 3. Trigger auf orders: ein Abholtermin, den der Kunde selbst wählt, muss in
--    die Öffnungszeiten fallen (Europe/Berlin, Öffnung und Schluss inklusive).
--    Als Trigger statt in create_order(), damit die Regel nicht an einer
--    Funktion hängt, die in 004, 029, 037, 049, 054 und 059 schon sechsmal
--    ersetzt wurde. Greift nur, wenn der Kunde für sich selbst bestellt –
--    Rechnungen, die der Admin für einen Kunden anlegt, bleiben unberührt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS opening_hours JSONB NOT NULL DEFAULT
  '[{"open":"11:00","close":"18:30"},null,{"open":"11:00","close":"18:30"},
    {"open":"11:00","close":"18:30"},{"open":"11:00","close":"18:30"},
    {"open":"11:00","close":"19:00"},{"open":"11:00","close":"19:00"}]'::jsonb;

COMMENT ON COLUMN public.company_settings.opening_hours IS
  'Öffnungszeiten je Wochentag (0 = Montag), null = geschlossen. Zeiten in Europe/Berlin.';

CREATE OR REPLACE FUNCTION public.public_opening_hours()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT opening_hours FROM public.company_settings WHERE id;
$$;

REVOKE ALL ON FUNCTION public.public_opening_hours() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_opening_hours() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_abholzeit_pruefen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_lokal TIMESTAMP;
  v_tag   INT;
  v_zeit  TIME;
  v_slot  JSONB;
BEGIN
  IF NEW.delivery_method <> 'pickup' OR NEW.pickup_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  v_lokal := NEW.pickup_at AT TIME ZONE public.pos_zeitzone();
  v_tag   := EXTRACT(ISODOW FROM v_lokal)::INT - 1;
  v_zeit  := v_lokal::TIME;

  SELECT opening_hours -> v_tag INTO v_slot
  FROM public.company_settings
  WHERE id;

  -- Keine Firmendaten-Zeile: nichts zu prüfen.
  IF v_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(v_slot) = 'null' THEN
    RAISE EXCEPTION 'An diesem Tag ist geschlossen. Bitte wählen Sie einen anderen Abholtermin.';
  END IF;

  IF v_zeit < (v_slot ->> 'open')::TIME OR v_zeit > (v_slot ->> 'close')::TIME THEN
    RAISE EXCEPTION 'Abholung nur zu unseren Öffnungszeiten (% bis % Uhr).',
      to_char((v_slot ->> 'open')::TIME, 'HH24:MI'),
      to_char((v_slot ->> 'close')::TIME, 'HH24:MI');
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_abholzeit ON public.orders;
CREATE TRIGGER trg_orders_abholzeit
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_abholzeit_pruefen();
