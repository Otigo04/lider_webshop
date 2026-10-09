-- =============================================================================
-- 064: Rechnung stornieren
--
-- Eine gestellte Rechnung wird nicht gelöscht und nicht umgeschrieben: sie
-- bleibt mit ihrer Nummer bestehen, und zu ihr entsteht eine Stornorechnung mit
-- eigener, lückenloser Nummer (LS0000001) und negativen Beträgen. Die Rechnung
-- selbst bekommt den Status „storniert“.
--
--   - invoices.status kennt jetzt 'cancelled'
--   - invoices.storno_number / cancelled_at / storno_reason / storno_file_path
--   - gehört die Rechnung zu einer Bestellung, steht auch die Bestellung auf
--     „storniert“ (orders.status 'cancelled')
--   - cancel_invoice() macht das in einer Transaktion. Eine Stornierung lässt
--     sich nicht zurücknehmen; ein Irrtum wird mit einer neuen Rechnung
--     korrigiert.
--
-- Bestand und Zahlung fasst die Funktion nicht an: reservierte Mengen und eine
-- Erstattung bearbeitet der Admin von Hand.
--
-- Idempotent.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.storno_number_seq START 1;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS storno_number    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storno_reason    TEXT,
  ADD COLUMN IF NOT EXISTS storno_file_path TEXT;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('open', 'paid', 'overdue', 'cancelled'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'submitted', 'confirmed', 'ready', 'shipped', 'delivered', 'cancelled'));

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.';
  END IF;
  IF v_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'Diese Rechnung ist schon storniert (%).', v_invoice.storno_number;
  END IF;

  UPDATE public.invoices
  SET status        = 'cancelled',
      cancelled_at  = now(),
      storno_number = 'LS' || lpad(nextval('public.storno_number_seq')::TEXT, 7, '0'),
      storno_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  IF v_invoice.order_id IS NOT NULL THEN
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_invoice.order_id;
  END IF;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(UUID, TEXT) TO authenticated;
