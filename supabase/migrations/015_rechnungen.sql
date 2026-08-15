-- =============================================================================
-- Migration 015 – Rechnungen
--
-- Eine Rechnung pro Bestellung (order_id UNIQUE). Die Zeile entsteht sofort
-- nach create_order() über create_invoice_for_order() (Nummer atomar per
-- Sequenz wie order_number_seq), das PDF wird danach von der App erzeugt und
-- hochgeladen – file_path bleibt bis dahin NULL.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL
                   DEFAULT 'LG-R-' || to_char(now(), 'YYYY') || '-' ||
                           lpad(nextval('public.invoice_number_seq')::TEXT, 5, '0'),
  -- Pfad im Storage-Bucket 'invoices', Format "<order_id>/<invoice_number>.pdf".
  -- NULL bis die App das PDF erzeugt und hochgeladen hat.
  file_path      TEXT,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'paid', 'overdue')),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_order  ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

-- -----------------------------------------------------------------------------
-- RLS – gleiches Muster wie orders: Kunde sieht nur eigene (über den Join zur
-- eigenen Bestellung), Admin sieht/ändert alles.
-- -----------------------------------------------------------------------------

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
DROP POLICY IF EXISTS invoices_admin_all  ON public.invoices;

CREATE POLICY invoices_select_own ON public.invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = invoices.order_id AND o.customer_id = auth.uid()
    ) AND public.is_active_user()
  );

CREATE POLICY invoices_admin_all ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- create_invoice_for_order – legt die Rechnungszeile an. SECURITY DEFINER wie
-- create_order(): der aufrufende Server-Code prüft vorher per requireUser(),
-- die Funktion selbst erzwingt zusätzlich, dass die Bestellung dem Aufrufer
-- gehört (oder er Admin ist), damit sie nicht direkt für fremde Bestellungen
-- missbraucht werden kann.
-- -----------------------------------------------------------------------------

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

  INSERT INTO public.invoices (order_id)
  VALUES (p_order_id)
  ON CONFLICT (order_id) DO UPDATE SET order_id = EXCLUDED.order_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_for_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_order(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Storage: Bucket 'invoices' (PRIVAT), gleiches Signed-URL-Prinzip wie
-- 'products' (siehe schema.sql Abschnitt 6). Pfad-Konvention
-- "<order_id>/<invoice_number>.pdf" erlaubt der Policy, den Objektnamen ohne
-- Zusatztabelle direkt gegen orders.id zu matchen.
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices', 'invoices', false,
  5242880,  -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "invoices read own"    ON storage.objects;
DROP POLICY IF EXISTS "invoices admin write" ON storage.objects;

CREATE POLICY "invoices read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.is_active_user()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id::text = split_part(storage.objects.name, '/', 1)
          AND o.customer_id = auth.uid()
      )
    )
  );

CREATE POLICY "invoices admin write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND public.is_admin())
  WITH CHECK (bucket_id = 'invoices' AND public.is_admin());

-- Server-Actions laden das PDF über den Service-Key hoch (umgeht RLS ohnehin,
-- siehe lib/supabase/admin.ts), "invoices admin write" deckt zusätzlich den
-- Fall ab, dass ein Admin später manuell im Dashboard nacharbeiten muss.
