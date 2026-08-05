-- =============================================================================
-- Migration 004 – Automatische Artikelnummern und Versandart
--
-- 1. Jede Kategorie bekommt einen zweistelligen Nummernkreis (10, 11, 12 …).
--    Artikelnummern entstehen daraus als "12-0001" – sechs Ziffern, durch den
--    Bindestrich am Telefon und auf dem Lieferschein lesbar.
-- 2. Bestellungen halten fest, ob abgeholt oder versendet wird.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nummernkreis je Kategorie
-- -----------------------------------------------------------------------------

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sku_prefix TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_sku_prefix_key'
  ) THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_sku_prefix_key
      UNIQUE (sku_prefix);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_sku_prefix_check'
  ) THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_sku_prefix_check
      CHECK (sku_prefix IS NULL OR sku_prefix ~ '^[0-9]{2}$');
  END IF;
END $$;

/*
 * Vergibt den nächsten freien Kreis, wenn beim Anlegen keiner angegeben wurde.
 * Start bei 10, damit alle Kreise gleich breit sind (kein "01" neben "10").
 */
CREATE OR REPLACE FUNCTION public.assign_sku_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sku_prefix IS NULL OR btrim(NEW.sku_prefix) = '' THEN
    SELECT lpad((COALESCE(MAX(sku_prefix::INT), 9) + 1)::TEXT, 2, '0')
    INTO NEW.sku_prefix
    FROM public.categories
    WHERE sku_prefix ~ '^[0-9]{2}$';

    IF NEW.sku_prefix::INT > 99 THEN
      RAISE EXCEPTION 'Alle Nummernkreise von 10 bis 99 sind vergeben.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_sku_prefix ON public.categories;
CREATE TRIGGER trg_categories_sku_prefix
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.assign_sku_prefix();

-- Bestehende Kategorien nachziehen, in ihrer bisherigen Reihenfolge.
DO $$
DECLARE
  v_row RECORD;
  v_next INT;
BEGIN
  SELECT COALESCE(MAX(sku_prefix::INT), 9) + 1 INTO v_next
  FROM public.categories WHERE sku_prefix ~ '^[0-9]{2}$';

  FOR v_row IN
    SELECT id FROM public.categories
    WHERE sku_prefix IS NULL
    ORDER BY order_index, created_at
  LOOP
    UPDATE public.categories
    SET sku_prefix = lpad(v_next::TEXT, 2, '0')
    WHERE id = v_row.id;
    v_next := v_next + 1;
  END LOOP;
END $$;

/*
 * Nächste freie Artikelnummer im Kreis der Kategorie.
 *
 * FOR UPDATE auf die Kategoriezeile serialisiert gleichzeitige Anlagen – ohne
 * die Sperre könnten zwei Admins dieselbe Nummer ziehen und der zweite liefe
 * in die Unique-Verletzung auf products.sku.
 *
 * Gezählt wird über das Maximum der bestehenden Nummern, nicht über eine
 * Sequenz: so bleiben Kreise nach dem Löschen von Artikeln lückenlos nutzbar
 * und ein Import bestehender Nummern verschiebt den Zähler automatisch mit.
 */
CREATE OR REPLACE FUNCTION public.next_sku(p_category_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix TEXT;
  v_next   INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Admins dürfen Artikelnummern vergeben.';
  END IF;

  SELECT sku_prefix INTO v_prefix
  FROM public.categories
  WHERE id = p_category_id
  FOR UPDATE;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Diese Kategorie hat keinen Nummernkreis.';
  END IF;

  SELECT COALESCE(MAX(substring(sku FROM 4)::INT), 0) + 1
  INTO v_next
  FROM public.products
  WHERE sku ~ ('^' || v_prefix || '-[0-9]{4}$');

  IF v_next > 9999 THEN
    RAISE EXCEPTION 'Der Nummernkreis % ist voll.', v_prefix;
  END IF;

  RETURN v_prefix || '-' || lpad(v_next::TEXT, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_sku(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_sku(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Versandart
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'shipping';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_method_check'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_method_check
      CHECK (delivery_method IN ('pickup', 'shipping'));
  END IF;
END $$;

-- create_order bekommt einen Parameter dazu, deshalb die alte Signatur weg.
DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT, TEXT);

CREATE FUNCTION public.create_order(
  p_items            JSONB,
  p_notes            TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_method  TEXT DEFAULT 'shipping'
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   public.orders;
  v_product public.products;
  v_tier    public.product_variants;
  v_row     RECORD;
  v_free    INT;
  v_sub     NUMERIC(12, 2);
  v_total   NUMERIC(12, 2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;

  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Dieses Konto ist deaktiviert.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Der Warenkorb ist leer.';
  END IF;

  IF p_delivery_method NOT IN ('pickup', 'shipping') THEN
    RAISE EXCEPTION 'Ungültige Versandart.';
  END IF;

  INSERT INTO public.orders (
    customer_id, status, notes, delivery_address, delivery_method, total_amount
  )
  VALUES (
    auth.uid(),
    'submitted',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    p_delivery_method,
    0
  )
  RETURNING * INTO v_order;

  FOR v_row IN
    SELECT (item ->> 'product_id')::UUID   AS product_id,
           SUM((item ->> 'quantity')::INT) AS quantity
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY 1
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_row.product_id AND is_active
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artikel ist nicht mehr verfügbar.';
    END IF;

    v_free := GREATEST(v_product.stock_available - v_product.stock_reserved, 0);
    IF v_row.quantity > v_free THEN
      RAISE EXCEPTION 'Von "%" sind nur noch % Stück verfügbar.',
        v_product.name, v_free;
    END IF;

    SELECT * INTO v_tier
    FROM public.product_variants
    WHERE product_id = v_product.id
      AND min_quantity <= v_row.quantity
    ORDER BY min_quantity DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mindestbestellmenge für "%" nicht erreicht.',
        v_product.name;
    END IF;

    v_sub := ROUND(v_tier.unit_price * v_row.quantity, 2);
    v_total := v_total + v_sub;

    INSERT INTO public.order_items (
      order_id, product_variant_id, product_name, product_sku,
      quantity, unit_price, subtotal
    )
    VALUES (
      v_order.id, v_tier.id, v_product.name, v_product.sku,
      v_row.quantity, v_tier.unit_price, v_sub
    );

    UPDATE public.products
    SET stock_reserved = stock_reserved + v_row.quantity
    WHERE id = v_product.id;
  END LOOP;

  UPDATE public.orders
  SET total_amount = v_total
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT)
  TO authenticated;
