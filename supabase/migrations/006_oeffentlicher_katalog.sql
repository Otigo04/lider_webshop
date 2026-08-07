-- =============================================================================
-- Migration 006 – Sortiment ohne Login sichtbar (ohne Preise, ohne Bestand)
--
-- Bisher war der komplette Katalog nur für angemeldete, aktive Kunden lesbar
-- (Design-Entscheidung aus dem Basisschema). Jetzt sollen auch anonyme
-- Besucher Kategorien, Artikelname, Foto und Beschreibung sehen können – als
-- Schaufenster, das zur Zugangsanfrage führt. Preise (product_variants) und
-- Bestand (products.stock_available/stock_reserved) bleiben Kunden mit Login
-- vorbehalten.
--
-- RLS kann Spalten nicht ausblenden, nur ganze Zeilen. Für Artikel steht der
-- Bestand aber in derselben Zeile wie Name/Beschreibung (siehe schema.sql,
-- products-Tabelle). Deshalb bekommt public eine eigene View ohne die
-- Bestandsspalten – die Basistabelle bleibt für anon weiterhin komplett
-- gesperrt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kategorien: auch für anonyme Besucher lesbar
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS categories_read ON public.categories;
CREATE POLICY categories_read ON public.categories
  FOR SELECT TO anon, authenticated USING (true);

-- -----------------------------------------------------------------------------
-- 2. Artikel: öffentliche View ohne Bestandsspalten
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at
FROM public.products
WHERE is_active = true;

GRANT SELECT ON public.products_public TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Artikelfotos: Metadaten und Storage-Objekte für anon freigeben,
--    aber nur zu aktiven Artikeln
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS images_read_public ON public.product_images;
CREATE POLICY images_read_public ON public.product_images
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id AND p.is_active
  ));

DROP POLICY IF EXISTS "product images read public" ON storage.objects;
CREATE POLICY "product images read public" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'products');

-- product_variants (Preise) bleiben unangetastet: variants_read verlangt
-- weiterhin is_active_user(), anon bekommt hier nie eine Zeile.
