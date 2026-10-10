-- =============================================================================
-- Migration 066 – Vorbestellung
--
-- 1. products.is_preorder / preorder_note: Artikel, der noch nicht eingetroffen
--    ist und im Shop vorbestellt werden darf. Wirksam nur, solange der freie
--    Bestand 0 ist; der Shop entscheidet das (lib/pricing.ts, istVorbestellbar).
-- 2. order_items.is_preorder: Schnappschuss, ob die Position eine Vorbestellung
--    war. create_order() bleibt unverändert; ein BEFORE-INSERT-Trigger setzt die
--    Markierung aus dem Artikel, bevor die Bestellung den Bestand reserviert.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_note TEXT;

COMMENT ON COLUMN public.products.is_preorder IS
  'Vorbestellbar, solange der freie Bestand 0 ist (Migration 066).';
COMMENT ON COLUMN public.products.preorder_note IS
  'Hinweis zur erwarteten Lieferung, z. B. "voraussichtlich KW 45" (Migration 066).';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.order_items.is_preorder IS
  'Position war bei der Bestellung eine Vorbestellung (Migration 066).';

CREATE OR REPLACE FUNCTION public.order_items_vorbestellung()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.product_variant_id IS NOT NULL THEN
    SELECT p.is_preorder AND (p.stock_available - p.stock_reserved) <= 0
      INTO NEW.is_preorder
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = NEW.product_variant_id;
    NEW.is_preorder := COALESCE(NEW.is_preorder, false);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS order_items_vorbestellung ON public.order_items;
CREATE TRIGGER order_items_vorbestellung
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_vorbestellung();
