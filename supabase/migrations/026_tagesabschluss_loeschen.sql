-- =============================================================================
-- Migration 026 – Tagesabschlüsse löschen
--
-- Ein Z-Abschluss ist eine buchhalterische Festschreibung und wird im Betrieb
-- nicht gelöscht. In der Einrichtungsphase entstehen aber Probeabschlüsse über
-- Testverkäufe, die niemand im Kassenbuch haben will – und ohne einen Weg,
-- sie loszuwerden, bliebe nur der SQL-Editor.
--
-- Zwei Funktionen mit unterschiedlicher Schärfe:
--   1. delete_pos_day_closing(date) – einen Abschluss zurücknehmen. Die
--      Z-Nummer bleibt verbraucht: sie stand womöglich schon auf einem
--      gedruckten Bon, und eine zweite Buchung unter derselben Nummer wäre
--      schlimmer als eine Lücke in der Reihe.
--   2. reset_pos_day_closings()     – alle Abschlüsse verwerfen und die
--      Nummerierung auf Z00001 zurücksetzen. Ausdrücklich für die
--      Einrichtung gedacht, bevor echt kassiert wird.
--
-- Gelöscht werden nur die Abschlüsse, nie die Verkäufe: die Bons bleiben in
-- pos_sales stehen und der Tag lässt sich jederzeit neu abschließen.
--
-- Dazu gehört zwingend eine Grenze für die Automatik: close_open_pos_days()
-- würde einen gerade gelöschten Tag beim nächsten Seitenaufruf sofort wieder
-- anlegen, das Löschen wäre wirkungslos. company_settings.pos_closing_from
-- sagt deshalb, ab welchem Tag automatisch nachgeholt wird; wer löscht,
-- schiebt diese Grenze hinter den gelöschten Tag. Manuell abschließen lässt
-- sich weiterhin jeder Tag – die Grenze bremst nur die Automatik.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Grenze für die Automatik
-- -----------------------------------------------------------------------------

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_closing_from DATE;

COMMENT ON COLUMN public.company_settings.pos_closing_from IS
  'Ab diesem Kassentag holt close_open_pos_days() fehlende Abschlüsse nach. NULL = alle Tage. Wird beim Löschen eines Abschlusses hinter den gelöschten Tag geschoben.';

-- close_open_pos_days aus Migration 025 um die Grenze erweitert. Sonst
-- unverändert.
CREATE OR REPLACE FUNCTION public.close_open_pos_days()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tag    DATE;
  v_ab     DATE;
  v_anzahl INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT pos_closing_from INTO v_ab FROM public.company_settings WHERE id;

  FOR v_tag IN
    SELECT DISTINCT public.pos_kassentag(s.created_at) AS tag
    FROM public.pos_sales s
    WHERE public.pos_kassentag(s.created_at) < public.pos_heute()
    AND (v_ab IS NULL OR public.pos_kassentag(s.created_at) >= v_ab)
    AND NOT EXISTS (
      SELECT 1 FROM public.pos_day_closings c
      WHERE c.business_date = public.pos_kassentag(s.created_at)
    )
    ORDER BY tag
  LOOP
    PERFORM public.close_pos_day(v_tag, NULL, true);
    v_anzahl := v_anzahl + 1;
  END LOOP;

  RETURN v_anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.close_open_pos_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_open_pos_days() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. Einen Abschluss zurücknehmen
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_pos_day_closing(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_geloescht INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Kein Datum angegeben.';
  END IF;

  DELETE FROM public.pos_day_closings WHERE business_date = p_date;
  GET DIAGNOSTICS v_geloescht = ROW_COUNT;

  IF v_geloescht > 0 THEN
    -- Grenze hinter den gelöschten Tag schieben, sonst legt die Automatik ihn
    -- beim nächsten Seitenaufruf wieder an. Nur vorwärts: eine schon weiter
    -- vorne stehende Grenze wird nicht zurückgenommen.
    UPDATE public.company_settings
    SET pos_closing_from = GREATEST(COALESCE(pos_closing_from, p_date + 1), p_date + 1)
    WHERE id;
  END IF;

  RETURN v_geloescht > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_pos_day_closing(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_pos_day_closing(DATE) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Alle Abschlüsse verwerfen und neu bei Z00001 beginnen
--
--    Setzt die Sequenz zurück. Das ist nur gefahrlos, solange keine Z-Nummer
--    außerhalb der Anwendung existiert – deshalb ist die Funktion in der
--    Oberfläche hinter einer getippten Bestätigung versteckt und trägt hier
--    diesen Hinweis.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_pos_day_closings()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anzahl INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT COUNT(*) INTO v_anzahl FROM public.pos_day_closings;

  DELETE FROM public.pos_day_closings;

  -- is_called = false: der nächste nextval liefert genau 1, nicht 2.
  PERFORM setval('public.pos_z_seq', 1, false);

  -- Die Automatik beginnt beim heutigen Tag von vorn: die Probetage von
  -- gestern sollen nicht postwendend zurückkehren.
  UPDATE public.company_settings
  SET pos_closing_from = public.pos_heute()
  WHERE id;

  RETURN v_anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_pos_day_closings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_pos_day_closings() TO authenticated;
