-- =============================================================================
-- Migration 020 – Artikel ohne Foto sind kein Sortiment
--
-- Die Kasse legt bei unbekanntem Barcode sofort einen Artikel an
-- (createQuickProduct, Migration 018) – ohne Foto, mit is_active = true.
-- Bisher landete der damit sofort im Shop. has_image trennt das: der Artikel
-- bleibt an der Kasse und im Inventar ganz normal nutzbar, taucht aber im
-- Webshop erst auf, sobald ein Foto hinterlegt ist.
--
-- has_image ist keine manuelle Einstellung, sondern folgt automatisch dem
-- tatsächlichen Bildbestand (Trigger auf product_images) – kein Schalter, der
-- vergessen werden kann und aus der Reihe läuft.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_image BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Artikel, die schon Fotos haben, gelten sofort als sichtbar.
UPDATE public.products p
SET has_image = true
WHERE EXISTS (
  SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id
) AND has_image = false;

CREATE INDEX IF NOT EXISTS idx_products_has_image ON public.products(has_image);

-- -----------------------------------------------------------------------------
-- Trigger: has_image folgt product_images, nicht umgekehrt
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_product_has_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  betroffenes_produkt UUID := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.products
  SET has_image = EXISTS (
    SELECT 1 FROM public.product_images WHERE product_id = betroffenes_produkt
  )
  WHERE id = betroffenes_produkt;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_images_sync_has_image ON public.product_images;
CREATE TRIGGER trg_product_images_sync_has_image
  AFTER INSERT OR DELETE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_has_image();

-- -----------------------------------------------------------------------------
-- Sichtbarkeit: RLS und öffentliche View ziehen has_image mit ein
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS products_read ON public.products;
CREATE POLICY products_read ON public.products
  FOR SELECT TO authenticated
  USING (public.is_active_user() AND ((is_active AND has_image) OR public.is_admin()));

-- Neue Spalte ans Ende, nicht dazwischen (siehe Migration 009 – 42P16,
-- CREATE OR REPLACE VIEW darf bestehende Spalten nicht umsortieren).
CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at,
       is_new, is_topseller, has_image
FROM public.products
WHERE is_active = true AND has_image = true;

GRANT SELECT ON public.products_public TO anon, authenticated;
