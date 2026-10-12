-- =============================================================================
-- 070: Restposten – A-Ware oder B-Ware
--
-- Ein Restposten kann Neuware im Auslauf sein (A-Ware: einwandfrei, nur nicht
-- mehr im Programm) oder B-Ware (Verpackung beschädigt, leichte Mängel). Das
-- ist für den Kunden die erste Frage und gehört deshalb ans Kennzeichen am
-- Foto, nicht nur in die Beschreibung.
--
-- NULL = keine Angabe: bestehende Restposten und Artikel, die keiner Klasse
-- zugeordnet werden sollen, bleiben unverändert. Nur sinnvoll bei
-- is_restposten; die Oberfläche setzt den Wert beim Abwählen zurück.
--
-- products_public führt die Spalte, damit das Schaufenster das Kennzeichen
-- zeigen kann (View ist security_invoker, Migration 034: Spaltenrecht für
-- anon steht deshalb mit hier).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS restposten_ware TEXT
  CHECK (restposten_ware IS NULL OR restposten_ware IN ('A', 'B'));

COMMENT ON COLUMN public.products.restposten_ware IS
  'Güteklasse eines Restpostens (Migration 070): A = einwandfrei, B = mit Mängeln; NULL = keine Angabe.';

-- Neue Spalte ans Ende: CREATE OR REPLACE VIEW darf bestehende Spalten weder
-- umbenennen noch umsortieren (42P16, siehe Migration 009).
CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at,
       is_new, is_topseller, has_image, list_price, group_id, is_restposten,
       restposten_ware
FROM public.products
WHERE is_active = true AND has_image = true;

ALTER VIEW public.products_public SET (security_invoker = true);
GRANT SELECT ON public.products_public TO anon, authenticated;

GRANT SELECT (restposten_ware) ON public.products TO anon;
