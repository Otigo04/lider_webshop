-- =============================================================================
-- Migration 069 – Texte der Sonderseiten im Shop
--
-- Der Satz unter der Überschrift von /shop/restposten, /shop/reduziert,
-- /shop/neuheiten und /shop/topseller stand fest im Code. Er wird jetzt unter
-- /admin/settings gepflegt.
--
-- Eine Zeile je Seite, nur für die überschriebenen: fehlt die Zeile, gilt der
-- Standardtext aus lib/shop-texte.ts. „Zurücksetzen" heißt also Zeile löschen.
--
-- Lesen darf jeder – die Seiten sind auch für Besucher ohne Konto sichtbar,
-- und company_settings ist nur für Angemeldete lesbar (siehe Migration 035).
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shop_texte (
  key        TEXT PRIMARY KEY
             CHECK (key IN ('restposten', 'reduziert', 'neuheiten', 'topseller')),
  text       TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 400),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_texte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_texte_read  ON public.shop_texte;
DROP POLICY IF EXISTS shop_texte_admin ON public.shop_texte;

CREATE POLICY shop_texte_read ON public.shop_texte
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY shop_texte_admin ON public.shop_texte
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.shop_texte TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_texte TO authenticated;

DROP TRIGGER IF EXISTS trg_shop_texte_updated_at ON public.shop_texte;
CREATE TRIGGER trg_shop_texte_updated_at
  BEFORE UPDATE ON public.shop_texte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.shop_texte IS
  'Überschriebene Texte der Sonderseiten (Migration 069) – gepflegt unter /admin/settings.';
