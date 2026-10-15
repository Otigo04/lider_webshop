-- =============================================================================
-- Migration 073 – USt-IdNr. / Steuernummer als Pflichtangabe bei Bestellung
--
-- users.vat_id (Migration 028) nimmt eine USt-IdNr. oder eine Steuernummer
-- auf. Ein Kunde, der für sich selbst bestellt, braucht eine. Das Format prüft
-- die Anwendung (lib/steuernummer.ts) beim Speichern; die Datenbank sichert
-- nur ab, dass überhaupt etwas hinterlegt ist – wie bei der Abholzeit als
-- Trigger auf orders und nur für Kunden, die selbst bestellen. Rechnungen, die
-- der Admin für einen Kunden anlegt, bleiben unberührt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.orders_steuernummer_pruefen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rolle  TEXT;
  v_ust_id TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT role, vat_id INTO v_rolle, v_ust_id
  FROM public.users
  WHERE id = auth.uid();

  IF v_rolle IS DISTINCT FROM 'customer' THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(COALESCE(v_ust_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bitte hinterlegen Sie Ihre USt-IdNr. oder Steuernummer in Ihrem Konto.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_steuernummer ON public.orders;
CREATE TRIGGER trg_orders_steuernummer
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_steuernummer_pruefen();
