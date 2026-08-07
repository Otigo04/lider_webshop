-- =============================================================================
-- Migration 013 – "ab"-Preise für nicht angemeldete Besucher
--
-- ACHTUNG, bewusste Änderung der Preispolitik: bisher war jeder Preis nur nach
-- Anmeldung sichtbar (schema.sql + Migration 006). Ab hier sieht jeder Besucher
-- – also auch der Wettbewerb – den günstigsten und den teuersten Stückpreis je
-- Artikel. Das ist gewollt: die Landingpage soll Händler abholen, und ein
-- Sortiment ohne jede Preisangabe tut das nicht.
--
-- Was weiterhin NICHT öffentlich ist:
--   - die einzelnen Staffeln (ab welcher Menge welcher Preis gilt)
--   - Bestände
--   - alles, was an product_variants direkt hängt
--
-- Die View liefert deshalb nur zwei aggregierte Zahlen pro Artikel, keine
-- Staffelzeilen. product_variants selbst bleibt für anon gesperrt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

DROP VIEW IF EXISTS public.product_price_range;
CREATE VIEW public.product_price_range AS
SELECT
  p.id                        AS product_id,
  MIN(v.unit_price)           AS min_unit_price,
  MAX(v.unit_price)           AS max_unit_price,
  MIN(v.min_quantity)         AS min_order_quantity,
  COUNT(*)                    AS tier_count
FROM public.products p
JOIN public.product_variants v ON v.product_id = p.id
WHERE p.is_active
GROUP BY p.id;

GRANT SELECT ON public.product_price_range TO anon, authenticated;
