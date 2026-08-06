-- =============================================================================
-- Migration 010 – Topseller-Flag am Artikel
--
-- Zweites Flag neben is_new (Migration 009), damit sich Flags in der
-- Admin-Artikelliste als Dropdown mit mehreren Checkboxen abbilden lassen.
-- Öffentliche Verwendung (eigene Nav-Punkte etc.) folgt im separat
-- geplanten Neuheiten/Topseller-Feature.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_topseller BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_topseller
  ON public.products(is_topseller) WHERE is_topseller;

-- Neue Spalte ans Ende, nicht dazwischen (siehe Migration 009 – 42P16,
-- CREATE OR REPLACE VIEW darf bestehende Spalten nicht umsortieren).
CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at,
       is_new, is_topseller
FROM public.products
WHERE is_active = true;

GRANT SELECT ON public.products_public TO anon, authenticated;
