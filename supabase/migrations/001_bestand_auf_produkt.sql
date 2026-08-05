-- =============================================================================
-- Migration 001 – Bestand von der Preisstaffel auf das Produkt
--
-- Grund: product_variants bildet Preisstaffeln ab (10-49, 50-199, 200+), nicht
-- eigenständige Artikelvarianten. Ein Lagerbestand je Staffel wäre dieselbe Ware
-- mehrfach gezählt. Der Bestand gehört an den Artikel.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_available INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_reserved  INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_available_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_available_check CHECK (stock_available >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_reserved_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_reserved_check CHECK (stock_reserved >= 0);
  END IF;
END $$;

-- Falls schon Bestände an Staffeln hängen: höchsten Wert je Produkt übernehmen.
UPDATE public.products p
SET stock_available = sub.max_stock
FROM (
  SELECT product_id, MAX(stock_available) AS max_stock
  FROM public.product_variants
  GROUP BY product_id
) sub
WHERE sub.product_id = p.id
  AND p.stock_available = 0
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_variants'
      AND column_name = 'stock_available'
  );

ALTER TABLE public.product_variants
  DROP COLUMN IF EXISTS stock_available,
  DROP COLUMN IF EXISTS stock_reserved;

-- Artikel mit wenig Bestand im Admin-Dashboard schnell finden
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products(stock_available);
