-- =============================================================================
-- Migration 021 – Frei definierbare Artikel-Flags
--
-- Neben den festen Flags is_new/is_topseller (Migration 009/010, die eigenes
-- Verhalten im Shop haben – Neu-Ablauf, eigene Nav-Punkte) soll der Admin sich
-- eigene Organisations-Flags anlegen können ("Auslaufartikel", "Nur Kasse" …),
-- um die Artikelverwaltung danach zu filtern. Rein intern: kein Bezug zu
-- products_public, keine Kundensichtbarkeit.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_flags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  -- Index in die bestehende .tag-N-Palette (app/globals.css) statt einer
  -- freien Hex-Farbe – so bleiben Flags optisch im selben System wie die
  -- Warengruppen-Farbpunkte, ohne eigene Farbverwaltung.
  color      INT NOT NULL CHECK (color BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.product_flag_links (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  flag_id    UUID NOT NULL REFERENCES public.product_flags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, flag_id)
);

CREATE INDEX IF NOT EXISTS idx_product_flag_links_flag ON public.product_flag_links(flag_id);

ALTER TABLE public.product_flags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_flag_links ENABLE ROW LEVEL SECURITY;

-- Rein admin: anders als Kategorien/Artikel gibt es hier keine
-- Kundenrolle, die mitlesen müsste.
DROP POLICY IF EXISTS product_flags_admin_all ON public.product_flags;
CREATE POLICY product_flags_admin_all ON public.product_flags
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS product_flag_links_admin_all ON public.product_flag_links;
CREATE POLICY product_flag_links_admin_all ON public.product_flag_links
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
