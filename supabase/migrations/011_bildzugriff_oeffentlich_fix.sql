-- =============================================================================
-- Migration 011 – Fix: Artikelfotos für anonyme Besucher weiterhin leer
--
-- Migration 006 sollte das schon regeln (images_read_public +
-- "product images read public"), kam beim zweiten Test aber wieder leer
-- zurück. Diese Datei enthält NUR die beiden Policies, isoliert, damit sich
-- nichts beim Copy-Paste verliert wie möglicherweise beim ersten Versuch.
--
-- Direkt danach prüfen (im SQL Editor):
--   select * from public.product_images limit 1;  -- als "anon" Rolle testen,
--   z. B. über "Run as" im Supabase SQL Editor falls verfügbar, oder einfach
--   die Seite /shop im Browser ohne Login neu laden.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

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
