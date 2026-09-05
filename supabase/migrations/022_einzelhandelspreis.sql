-- =============================================================================
-- Migration 022 – Einzelhandelspreis am Artikel
--
-- Der Betrieb verkauft über zwei Kanäle mit zwei Preislisten: Händler bekommen
-- die Staffelpreise aus product_variants, Laufkundschaft am Tresen den
-- Ladenpreis. Bisher gab es nur die Staffeln – ein Privatkunde an der Kasse
-- zahlte dadurch Großhandelspreise.
--
-- retail_price hängt am Artikel, nicht an einer Staffel: der Ladenpreis kennt
-- keine Menge. NULL heißt "nicht gepflegt"; die Kasse fällt dann auf die
-- kleinste Staffel zurück, statt den Artikel unverkäuflich zu machen.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS retail_price NUMERIC(10, 2)
    CHECK (retail_price IS NULL OR retail_price >= 0);

COMMENT ON COLUMN public.products.retail_price IS
  'Einzelhandelspreis für den Ladenverkauf (brutto/netto nach company_settings.pos_prices_gross). NULL = nicht gepflegt, Kasse nutzt dann die kleinste Großhandelsstaffel.';

-- products_public bleibt unverändert: der Ladenpreis ist eine interne Größe
-- der Kasse und gehört nicht ins öffentliche Schaufenster.
