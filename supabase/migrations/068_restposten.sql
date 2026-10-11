-- =============================================================================
-- 068: Restposten / B-Ware
--
-- Ein Artikel kann als Restposten gekennzeichnet werden. Er bleibt in seiner
-- Warengruppe (Lego bleibt unter Lego) und erscheint zusätzlich unter
-- /shop/restposten – dieselbe Mechanik wie Topseller und Neuheiten.
--
-- Restposten sind eigene Artikel mit eigener Artikelnummer, eigenem Bestand und
-- eigenem Preis (Karton eingedrückt, Auslaufware …). Die Neuware desselben
-- Produkts bleibt davon unberührt. Es gibt deshalb keine Verknüpfung zwischen
-- beiden; der Hinweis auf den Zustand steht in der Artikelbeschreibung.
--
-- products_public führt die Spalte, damit das Schaufenster das Kennzeichen am
-- Foto zeigen kann. Die View ist security_invoker (Migration 034): ohne
-- Spaltenrecht für anon käme die Abfrage ohne Anmeldung mit einem Fehler
-- zurück, deshalb steht der GRANT hier mit.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_restposten BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.is_restposten IS
  'Restposten/B-Ware (Migration 068): zusätzlich unter /shop/restposten, am Foto gekennzeichnet.';

CREATE INDEX IF NOT EXISTS idx_products_restposten
  ON public.products (is_restposten) WHERE is_restposten;

-- Neue Spalte ans Ende: CREATE OR REPLACE VIEW darf bestehende Spalten weder
-- umbenennen noch umsortieren (42P16, siehe Migration 009).
CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at,
       is_new, is_topseller, has_image, list_price, group_id, is_restposten
FROM public.products
WHERE is_active = true AND has_image = true;

ALTER VIEW public.products_public SET (security_invoker = true);
GRANT SELECT ON public.products_public TO anon, authenticated;

GRANT SELECT (is_restposten) ON public.products TO anon;
