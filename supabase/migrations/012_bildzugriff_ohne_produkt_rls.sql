-- =============================================================================
-- Migration 012 – Artikelfotos für anonyme Besucher: eigentliche Ursache
--
-- Migration 006 und der Nachschlag 011 haben dieselbe Policy gesetzt:
--
--   USING (EXISTS (SELECT 1 FROM public.products p
--                  WHERE p.id = product_images.product_id AND p.is_active))
--
-- Der Unterausdruck läuft mit den Rechten des fragenden Benutzers, nicht mit
-- denen des Policy-Autors. Für "anon" ist public.products per RLS komplett
-- gesperrt (Absicht: dort steht der Bestand). Das EXISTS liefert deshalb immer
-- false, und anonyme Besucher bekommen konsequent null Bildzeilen – genau das
-- Symptom, das 011 beheben sollte.
--
-- Die Prüfung wandert deshalb in eine SECURITY-DEFINER-Funktion. Sie gibt nur
-- true/false zurück, keine Spaltenwerte: Bestand und Preise bleiben
-- unerreichbar.
--
-- Prüfen nach dem Ausführen (mit dem anon-Key, z. B. Seite ohne Login laden):
--   select count(*) from public.product_images;  -- muss > 0 sein
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.product_is_public(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id AND is_active
  );
$$;

GRANT EXECUTE ON FUNCTION public.product_is_public(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS images_read_public ON public.product_images;
CREATE POLICY images_read_public ON public.product_images
  FOR SELECT TO anon
  USING (public.product_is_public(product_id));

-- Zweite Hälfte: die Datei selbst. Ohne diese Policy liefert das Signieren der
-- URL zwar einen Link, der Abruf endet aber in 400. Unverändert aus 006/011
-- übernommen, hier nur zur Vollständigkeit noch einmal mit.
DROP POLICY IF EXISTS "product images read public" ON storage.objects;
CREATE POLICY "product images read public" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'products');
