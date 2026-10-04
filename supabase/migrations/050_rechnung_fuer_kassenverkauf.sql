-- =============================================================================
-- Migration 050 – Rechnung zu einem Kassenverkauf
--
-- An der Kasse bekam ein Großhandelskunde bisher nur den Beleg (Kassenbon-PDF,
-- pos_sales.file_path) – die Nach-dem-Bon-Maske bot keinen Weg zu einer
-- echten Rechnung. Ein Händler mit Konto will aber oft beides: den Bon für
-- die eigene Buchhaltung, und eine Rechnung mit Rechnungsnummer für seine.
--
-- invoices bekommt dafür einen dritten Typ 'pos' neben 'order' und 'manual'.
-- Die Positionen kopiert create_invoice_for_pos_sale() nicht nach
-- invoice_items – wie bei 'order' (das über order_items liest) stehen sie
-- schon vollständig in pos_sale_items, ein zweiter Satz liefe darüber
-- auseinander, sobald jemand eine Zeile im Nachhinein ansieht.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pos_sale_id UUID REFERENCES public.pos_sales(id) ON DELETE CASCADE;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
  CHECK (type IN ('order', 'manual', 'pos'));

-- Eine Rechnung pro Kassenverkauf, wie order_id weiter oben: ein zweiter Klick
-- auf "Rechnung erzeugen" soll die bestehende Nummer zurückgeben, nicht eine
-- zweite ziehen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_pos_sale_unique
  ON public.invoices (pos_sale_id) WHERE pos_sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_pos_sale ON public.invoices (pos_sale_id);

-- Rechnungen zu Kassenverkäufen tragen schon ihre Summen (wie 'manual'), die
-- Constraint aus Migration 016 gilt deshalb für beide Typen.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_manual_has_totals;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_manual_has_totals
  CHECK (type NOT IN ('manual', 'pos') OR (net_amount IS NOT NULL AND total_amount IS NOT NULL));

-- -----------------------------------------------------------------------------
-- create_invoice_for_pos_sale – legt die Rechnungszeile zu einem bereits
-- gebuchten Kassenverkauf an. Nur für Verkäufe mit Kundenkonto: ein
-- Barverkauf ohne Konto hat niemanden, an den die Rechnung adressiert wäre
-- (dafür gibt es den Beleg). SECURITY DEFINER wie create_pos_sale() – der
-- aufrufende Server-Code prüft zusätzlich per requireAdmin().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invoice_for_pos_sale(p_sale_id UUID)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale    public.pos_sales;
  v_invoice public.invoices;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verkauf nicht gefunden.';
  END IF;

  IF v_sale.customer_id IS NULL THEN
    RAISE EXCEPTION 'Dieser Verkauf hat kein Kundenkonto – dafür gibt es den Beleg.';
  END IF;

  INSERT INTO public.invoices (
    pos_sale_id, customer_id, type, net_amount, vat_amount, total_amount
  )
  VALUES (
    p_sale_id, v_sale.customer_id, 'pos',
    v_sale.net_amount, v_sale.vat_amount, v_sale.total_amount
  )
  ON CONFLICT (pos_sale_id) DO UPDATE SET pos_sale_id = EXCLUDED.pos_sale_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_for_pos_sale(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_pos_sale(UUID) TO authenticated;
