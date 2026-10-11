-- =============================================================================
-- 067: „Kunden kauften auch"
--
-- Welche Artikel stehen zusammen mit einem Artikel in denselben Bestellungen?
-- Die Antwort braucht Bestellungen anderer Kunden, die ein Kunde per RLS nicht
-- lesen darf. Deshalb eine SECURITY-DEFINER-Funktion, die nur Artikel-IDs und
-- eine Anzahl herausgibt – keine Kunden, keine Mengen, keine Preise, keine
-- Bestellnummern.
--
--   - gezählt werden Bestellungen ab Status 'submitted'; Entwürfe und
--     stornierte Bestellungen zählen nicht
--   - je Bestellung höchstens einmal, egal wie oft der Artikel darin steht
--   - nur aktive Artikel mit Foto (wie der Shop-Katalog, Migration 020)
--   - Aufruf nur für angemeldete, aktive Kunden und Admins
--
-- Idempotent.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON public.order_items(product_variant_id);

CREATE OR REPLACE FUNCTION public.kunden_kauften_auch(
  p_product_id UUID,
  p_limit      INT DEFAULT 10
)
RETURNS TABLE (product_id UUID, anzahl BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH diese AS (
    SELECT DISTINCT oi.order_id
    FROM public.order_items oi
    JOIN public.product_variants pv ON pv.id = oi.product_variant_id
    JOIN public.orders o ON o.id = oi.order_id
    WHERE pv.product_id = p_product_id
      AND o.status NOT IN ('draft', 'cancelled')
  )
  SELECT pv.product_id, COUNT(DISTINCT oi.order_id) AS anzahl
  FROM diese d
  JOIN public.order_items oi ON oi.order_id = d.order_id
  JOIN public.product_variants pv ON pv.id = oi.product_variant_id
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.product_id <> p_product_id
    AND p.is_active
    AND p.has_image
    AND (public.is_active_user() OR public.is_admin())
  GROUP BY pv.product_id
  ORDER BY anzahl DESC, pv.product_id
  LIMIT LEAST(GREATEST(p_limit, 1), 24);
$$;

REVOKE ALL ON FUNCTION public.kunden_kauften_auch(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kunden_kauften_auch(UUID, INT) TO authenticated;
