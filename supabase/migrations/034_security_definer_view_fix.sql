-- =============================================================================
-- Migration 034 – Supabase Advisor: "Security Definer View" (kritisch) beheben
--
-- Der Advisor bemängelt `public.products_public` und `public.product_price_range`:
-- eine gewöhnliche View prüft Rechte standardmäßig mit den Privilegien ihres
-- Besitzers (hier: die Migrationsrolle), nicht mit denen des Aufrufers – exakt
-- so, wie eine SECURITY DEFINER-Funktion es täte, nur implizit und ohne
-- `security_invoker`-Kennzeichnung.
--
-- Beide Views sind bewusst öffentlich (migrations/006 und /013), aber aus
-- unterschiedlichen Gründen unterschiedlich zu reparieren:
--
--   - products_public wird in getPublicProduct() über
--     `category:categories (*)` eingebettet (PostgREST-FK-Embedding). Das
--     funktioniert nur, wenn die View ihre Spalten direkt und unverändert aus
--     `products` liest, damit PostgREST die Fremdschlüsselbeziehung
--     `category_id → categories.id` durch die View hindurch erkennt. Sie
--     bleibt deshalb eine normale View über der Tabelle; stattdessen bekommt
--     `anon` genau die Spalten und genau die Zeilen, die die View ohnehin
--     zeigt, jetzt explizit über RLS und Spaltenrechte statt implizit über
--     den View-Besitzer.
--
--   - product_price_range wird nirgends eingebettet. Hier bliebe bei
--     gleichem Weg (RLS + Spaltenrechte auf product_variants) ein echtes Loch:
--     `anon` könnte dann jede einzelne Preisstaffel-Zeile einzeln abfragen
--     (`/rest/v1/product_variants?select=...`) statt nur die aggregierten
--     Min/Max-Werte, die die View zeigt – migrations/013 hält ausdrücklich
--     fest, dass die einzelnen Staffeln nicht öffentlich sein dürfen. Diese
--     View liest deshalb aus einer SECURITY DEFINER-Funktion mit fest
--     gesetztem `search_path`; die View selbst bekommt `security_invoker`
--     und berührt `product_variants` nicht mehr direkt, `product_variants`
--     bleibt für `anon` komplett gesperrt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. products_public – security_invoker + passende RLS-Policy/Spaltenrechte
--
-- Deckt sich exakt mit der WHERE-Klausel und der Spaltenliste der View
-- (migrations/033): keine neue Zeile, keine neue Spalte wird für anon
-- sichtbar, die die View nicht ohnehin schon zeigt.
-- -----------------------------------------------------------------------------

-- Supabase gewährt anon/authenticated standardmäßig SELECT auf die ganze
-- Zeile (alle Spalten); bisher war das für anon folgenlos, weil keine Policy
-- griff. Die neue Policy unten würde ohne das REVOKE plötzlich auch
-- stock_available, stock_reserved, created_by und retail_price für anon
-- öffnen – Spalten, die weder die alte View noch migrations/006 je gezeigt
-- haben. Deshalb erst der Blankozugriff weg, dann gezielt nur die
-- Spalten der View wieder dazu.
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, category_id, sku, name, description, is_active, created_at, updated_at,
  is_new, is_topseller, has_image, list_price, group_id
) ON public.products TO anon;

DROP POLICY IF EXISTS products_read_public ON public.products;
CREATE POLICY products_read_public ON public.products
  FOR SELECT TO anon
  USING (is_active AND has_image);

ALTER VIEW public.products_public SET (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 2. product_price_range – SECURITY DEFINER-Funktion statt direkter View
--
-- product_variants bleibt für anon komplett gesperrt (migrations/013); die
-- Funktion liest mit den Rechten ihres Besitzers, die View danach nur noch
-- mit den Rechten des Aufrufers aus der Funktion.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._product_price_range()
RETURNS TABLE (
  product_id         UUID,
  min_unit_price     NUMERIC,
  max_unit_price     NUMERIC,
  min_order_quantity INT,
  tier_count         BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id                AS product_id,
    MIN(v.unit_price)   AS min_unit_price,
    MAX(v.unit_price)   AS max_unit_price,
    MIN(v.min_quantity) AS min_order_quantity,
    COUNT(*)            AS tier_count
  FROM public.products p
  JOIN public.product_variants v ON v.product_id = p.id
  WHERE p.is_active
  GROUP BY p.id;
$$;

REVOKE ALL ON FUNCTION public._product_price_range() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._product_price_range() TO anon, authenticated;

DROP VIEW IF EXISTS public.product_price_range;
CREATE VIEW public.product_price_range
WITH (security_invoker = true) AS
SELECT * FROM public._product_price_range();

GRANT SELECT ON public.product_price_range TO anon, authenticated;
