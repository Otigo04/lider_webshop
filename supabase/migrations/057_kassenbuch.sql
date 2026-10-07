-- =============================================================================
-- 057 – Kassenbuch: Tageskasse von Hand
--
-- Gepflegt unter /admin/kassenbuch. Eine Zeile je Tag mit den drei Beträgen
-- Bargeld, Karte und Großhandel. Reine Handeingabe – hängt an keiner Kasse,
-- keinem Beleg und keiner Nummer. Mit dem Kassenportal (/kasse) und dem
-- Z-Abschluss gibt es keine Verbindung.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cash_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date  DATE NOT NULL UNIQUE,
  cash        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cash >= 0),
  card        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (card >= 0),
  wholesale   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (wholesale >= 0),
  note        TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_cash_entries_updated_at ON public.cash_entries;
CREATE TRIGGER trg_cash_entries_updated_at
  BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_entries_admin ON public.cash_entries;
CREATE POLICY cash_entries_admin ON public.cash_entries
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_entries TO authenticated;
