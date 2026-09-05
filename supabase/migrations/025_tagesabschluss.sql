-- =============================================================================
-- Migration 025 – Tagesabschluss der Ladenkasse (Z-Abschluss)
--
-- Bisher ließ sich der Tagesumsatz nur zusammenrechnen, solange man danach
-- fragte: pos_summary summiert einen Zeitraum, aber nichts hielt fest, dass
-- ein Tag abgeschlossen ist und mit welchen Zahlen. Genau das ist der
-- Z-Abschluss – die Zahlen eines Kassentags, festgeschrieben und fortlaufend
-- nummeriert.
--
-- Enthalten:
--   1. pos_day_closings          – eine Zeile je Kassentag, Z-Nummer aus Sequenz
--   2. close_pos_day(date)       – einen Tag abschließen oder neu berechnen
--   3. close_open_pos_days()     – alle vergangenen offenen Tage nachholen
--   4. pos_day_totals(from, to)  – Tagessummen inkl. der noch offenen Tage
--
-- Kein Cron: der Nachhol-Aufruf hängt am Aufruf der Kassenseiten (siehe
-- lib/queries/kasse.ts). Wer die Kasse öffnet, schließt damit die Tage, die
-- er vergessen hat. Eine Datenbank, die zu einer festen Uhrzeit von selbst
-- bucht, bräuchte pg_cron und wäre für einen Laden mit festen Öffnungszeiten
-- mehr Betriebsrisiko als Nutzen.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Ladenzeitzone
--
--    Ein Kassentag endet mit dem Ladenschluss, nicht um Mitternacht UTC.
--    Supabase läuft auf UTC; ohne Umrechnung fielen abendliche Verkäufe im
--    Sommer auf den Folgetag. Die Zeitzone steht hier an einer Stelle – bei
--    einem Umzug wird nur diese Funktion geändert, nicht jede Abfrage.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pos_zeitzone()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT 'Europe/Berlin'::TEXT $$;

GRANT EXECUTE ON FUNCTION public.pos_zeitzone() TO authenticated;

-- Kassentag eines Zeitpunkts in Ladenzeit.
CREATE OR REPLACE FUNCTION public.pos_kassentag(p_zeitpunkt TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT (p_zeitpunkt AT TIME ZONE public.pos_zeitzone())::DATE $$;

GRANT EXECUTE ON FUNCTION public.pos_kassentag(TIMESTAMPTZ) TO authenticated;

-- Heutiger Kassentag.
CREATE OR REPLACE FUNCTION public.pos_heute()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT public.pos_kassentag(now()) $$;

GRANT EXECUTE ON FUNCTION public.pos_heute() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. Tabelle
-- -----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.pos_z_seq START 1;

CREATE TABLE IF NOT EXISTS public.pos_day_closings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Der Kassentag, nicht der Zeitpunkt des Abschlusses. UNIQUE: einen Tag gibt
  -- es genau einmal, ein zweiter Abschluss rechnet die Zeile neu.
  business_date  DATE UNIQUE NOT NULL,
  z_number       TEXT UNIQUE NOT NULL
                   DEFAULT 'Z' || lpad(nextval('public.pos_z_seq')::TEXT, 5, '0'),
  closed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = automatisch nachgeholt, sonst der Admin, der abgeschlossen hat.
  closed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sales_count    INT NOT NULL DEFAULT 0,
  net_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vat_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  card_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- Belegnummernbereich: gehört auf jeden Z-Bon, damit sich die Lücke
  -- zwischen zwei Abschlüssen nachweisen lässt.
  first_receipt  TEXT,
  last_receipt   TEXT,
  note           TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_day_closings_date
  ON public.pos_day_closings (business_date DESC);

ALTER TABLE public.pos_day_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_day_closings_admin ON public.pos_day_closings;
CREATE POLICY pos_day_closings_admin ON public.pos_day_closings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. Einen Tag abschließen
--
--    Rechnet über den ganzen Kalendertag in Ortszeit. Ein erneuter Aufruf für
--    denselben Tag aktualisiert die Zahlen und den Zeitstempel, behält aber
--    die einmal vergebene Z-Nummer: eine Abschlussnummer wird nicht neu
--    vergeben, sonst wäre die Reihe nicht mehr lückenlos.
--
--    Der heutige Tag darf abgeschlossen werden – der Laden schließt vor
--    Mitternacht. Kommt danach noch ein Verkauf, weist die Übersicht die
--    Abweichung aus und der Abschluss lässt sich neu rechnen.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_pos_day(
  p_date DATE,
  p_note TEXT DEFAULT NULL,
  -- true = automatisch nachgeholt, dann bleibt closed_by leer
  p_automatic BOOLEAN DEFAULT false
)
RETURNS public.pos_day_closings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      public.pos_day_closings;
  v_von      TIMESTAMPTZ;
  v_bis      TIMESTAMPTZ;
  v_anzahl   INT;
  v_netto    NUMERIC(12, 2);
  v_ust      NUMERIC(12, 2);
  v_brutto   NUMERIC(12, 2);
  v_bar      NUMERIC(12, 2);
  v_karte    NUMERIC(12, 2);
  v_erster   TEXT;
  v_letzter  TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Kein Datum angegeben.';
  END IF;

  IF p_date > public.pos_heute() THEN
    RAISE EXCEPTION 'Ein künftiger Tag lässt sich nicht abschließen.';
  END IF;

  -- Mitternacht bis Mitternacht in Ladenzeit, nicht in UTC.
  v_von := p_date::TIMESTAMP AT TIME ZONE public.pos_zeitzone();
  v_bis := (p_date + 1)::TIMESTAMP AT TIME ZONE public.pos_zeitzone();

  SELECT COUNT(*),
         COALESCE(SUM(net_amount), 0),
         COALESCE(SUM(vat_amount), 0),
         COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'cash'), 0),
         COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'card'), 0),
         MIN(receipt_number),
         MAX(receipt_number)
    INTO v_anzahl, v_netto, v_ust, v_brutto, v_bar, v_karte, v_erster, v_letzter
  FROM public.pos_sales
  WHERE created_at >= v_von AND created_at < v_bis;

  INSERT INTO public.pos_day_closings AS c (
    business_date, closed_by, sales_count, net_amount, vat_amount,
    gross_amount, cash_amount, card_amount, first_receipt, last_receipt, note
  )
  VALUES (
    p_date,
    CASE WHEN p_automatic THEN NULL ELSE auth.uid() END,
    v_anzahl, v_netto, v_ust, v_brutto, v_bar, v_karte,
    v_erster, v_letzter,
    NULLIF(btrim(COALESCE(p_note, '')), '')
  )
  ON CONFLICT (business_date) DO UPDATE SET
    -- z_number bleibt bewusst unangetastet.
    closed_at     = now(),
    closed_by     = CASE WHEN p_automatic THEN c.closed_by ELSE auth.uid() END,
    sales_count   = EXCLUDED.sales_count,
    net_amount    = EXCLUDED.net_amount,
    vat_amount    = EXCLUDED.vat_amount,
    gross_amount  = EXCLUDED.gross_amount,
    cash_amount   = EXCLUDED.cash_amount,
    card_amount   = EXCLUDED.card_amount,
    first_receipt = EXCLUDED.first_receipt,
    last_receipt  = EXCLUDED.last_receipt,
    note          = COALESCE(EXCLUDED.note, c.note)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.close_pos_day(DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_pos_day(DATE, TEXT, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Vergessene Tage nachholen
--
--    Schließt jeden vergangenen Tag, an dem verkauft wurde und der noch keinen
--    Abschluss hat. Der heutige Tag bleibt offen – er läuft noch.
--    Gibt die Zahl der nachgeholten Abschlüsse zurück.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_open_pos_days()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tag    DATE;
  v_anzahl INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  FOR v_tag IN
    SELECT DISTINCT public.pos_kassentag(s.created_at) AS tag
    FROM public.pos_sales s
    WHERE public.pos_kassentag(s.created_at) < public.pos_heute()
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
-- 4. Tagessummen für die Übersicht
--
--    Rechnet aus pos_sales, nicht aus den Abschlüssen: so steht der laufende
--    Tag mit denselben Spalten in derselben Liste wie die abgeschlossenen, und
--    eine Abweichung zwischen festgeschriebener und tatsächlicher Summe fällt
--    auf, statt sich zu verstecken.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pos_day_totals(p_from DATE, p_to DATE)
RETURNS TABLE (
  business_date DATE,
  sales_count   INT,
  net_amount    NUMERIC,
  vat_amount    NUMERIC,
  gross_amount  NUMERIC,
  cash_amount   NUMERIC,
  card_amount   NUMERIC,
  first_receipt TEXT,
  last_receipt  TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.pos_kassentag(s.created_at) AS business_date,
         COUNT(*)::INT,
         COALESCE(SUM(s.net_amount), 0),
         COALESCE(SUM(s.vat_amount), 0),
         COALESCE(SUM(s.total_amount), 0),
         COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'cash'), 0),
         COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'card'), 0),
         MIN(s.receipt_number),
         MAX(s.receipt_number)
  FROM public.pos_sales s
  WHERE public.is_admin()
    AND (p_from IS NULL OR s.created_at >= p_from::TIMESTAMP AT TIME ZONE public.pos_zeitzone())
    AND (p_to IS NULL OR s.created_at < (p_to + 1)::TIMESTAMP AT TIME ZONE public.pos_zeitzone())
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

REVOKE ALL ON FUNCTION public.pos_day_totals(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_day_totals(DATE, DATE) TO authenticated;
