-- =============================================================================
-- Migration 009 – Neuheit-Flag am Artikel
--
-- Grundgerüst für die Neuheiten-Sektion auf der Landingpage. Bewusst nur
-- is_new – ein volles Neuheiten/Topseller-Feature mit eigenen Nav-Punkten
-- ist ein separates, noch zu planendes Vorhaben.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_new ON public.products(is_new) WHERE is_new;

-- products_public (Migration 006) muss is_new mitliefern, sonst kann die
-- Landingpage für anonyme Besucher keine Neuheiten filtern.
--
-- CREATE OR REPLACE VIEW darf bestehende Spalten nicht umbenennen oder
-- umsortieren (Postgres-Fehler 42P16) - neue Spalten müssen ans Ende. Erster
-- Versuch hatte is_new vor created_at/updated_at eingefügt, das schlug fehl.
CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at, is_new
FROM public.products
WHERE is_active = true;

GRANT SELECT ON public.products_public TO anon, authenticated;
