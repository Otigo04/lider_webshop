-- =============================================================================
-- 078 – Eigener Text bei „Preis auf Anfrage"
--
-- products.price_on_request_note: Text, der auf der Artikelseite statt des
-- Standardtexts unter „Preis auf Anfrage" steht (Migration 077). Leer = der
-- Standardtext aus lib/preisanfrage.ts.
--
-- preis_auf_anfrage_text(id): der Text für die Artikelseite, auch für Besucher
-- lesbar; gibt nur etwas heraus, wenn der Artikel im Shop zu sehen ist und auf
-- Anfrage steht. Eine Funktion statt einer Spalte in einer View: so läuft der
-- Shop ohne Fehler weiter, solange die Migration fehlt (dann Standardtext).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_on_request_note TEXT
  CHECK (price_on_request_note IS NULL OR char_length(price_on_request_note) <= 500);

COMMENT ON COLUMN public.products.price_on_request_note IS
  'Eigener Text unter „Preis auf Anfrage" (Migration 078); NULL = Standardtext.';

CREATE OR REPLACE FUNCTION public.preis_auf_anfrage_text(p_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(btrim(p.price_on_request_note), '')
  FROM public.products p
  WHERE p.id = p_id
    AND p.price_on_request
    AND p.is_active
    AND p.has_image;
$$;

REVOKE ALL ON FUNCTION public.preis_auf_anfrage_text(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preis_auf_anfrage_text(UUID) TO anon, authenticated;
