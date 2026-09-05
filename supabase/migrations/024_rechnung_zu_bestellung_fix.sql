-- =============================================================================
-- Migration 024 – create_invoice_for_order reparieren
--
-- Fehlerbild: Der Admin legt unter /kasse/rechnungen/new eine Bestellung aus
-- dem Katalog an, die Bestellung entsteht – eine Rechnung dazu aber nie. Auf
-- der Bestellseite steht dauerhaft "Noch keine Rechnung vorhanden".
--
-- Ursache: Migration 016 hat den Unique-Constraint invoices_order_id_key
-- entfernt und durch einen PARTIELLEN Index ersetzt
-- (idx_invoices_order_unique ... WHERE order_id IS NOT NULL), weil freie
-- Rechnungen gar keine Bestellung haben. Die Funktion arbeitet aber weiter mit
--
--     ON CONFLICT (order_id) DO UPDATE ...
--
-- Zu einem partiellen Index passt ein solches Konfliktziel nur, wenn dessen
-- Bedingung mit angegeben wird; sonst antwortet Postgres mit 42P10
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Die Ausnahme wurde im Aufrufer nur geloggt – deshalb blieb
-- der Fehler unsichtbar und die Bestellung ohne Rechnung.
--
-- Statt die Bedingung nachzureichen, wird der Fall jetzt ausdrücklich
-- behandelt: eine vorhandene Rechnung wird zurückgegeben, sonst eine neue
-- angelegt. Das liest sich als Absicht ("eine Rechnung je Bestellung") und
-- hängt nicht mehr an der Form des Index. Der partielle Index bleibt als
-- Absicherung gegen die Wettlaufsituation bestehen.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_for_order(p_order_id UUID)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   public.orders;
  v_invoice public.invoices;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden.';
  END IF;

  IF v_order.customer_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung für diese Bestellung.';
  END IF;

  -- Schon eine Rechnung zur Bestellung? Dann diese zurückgeben. Eine gestellte
  -- Rechnung wird nie durch eine zweite ersetzt – die Nummer ist vergeben.
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE order_id = p_order_id;

  IF FOUND THEN
    RETURN v_invoice;
  END IF;

  INSERT INTO public.invoices (order_id, customer_id, type)
  VALUES (p_order_id, v_order.customer_id, 'order')
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;
