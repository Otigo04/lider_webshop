-- =============================================================================
-- Migration 023 – Streichpreis und Bestandsabbuchung bei Admin-Bestellungen
--
-- Zwei Themen, beide am Verkauf:
--
-- 1. list_price ("Vorher-Preis") am Artikel. Wer reduziert, will das auch
--    zeigen: alter Preis durchgestrichen, neuer Preis in Signalfarbe, Ersparnis
--    in Prozent. Der Wert hängt am Artikel, nicht an einer Staffel – er ist
--    eine Behauptung über den früheren Preis, keine Mengenstufe. NULL heißt
--    "nicht reduziert"; ein Wert, der nicht über dem aktuellen Preis liegt,
--    wird in der Anzeige ignoriert statt eine Ersparnis von 0 % zu behaupten.
--
-- 2. create_admin_order bucht den Bestand jetzt ab, statt ihn nur zu
--    reservieren. Legt der Admin eine Bestellung für einen Kunden an (Telefon-
--    oder Thekengeschäft), geht die Ware im selben Moment aus dem Regal – wie
--    an der Kasse (create_pos_sale, Migration 018). Die Reservierung stammte
--    aus dem Checkout-Pfad, wo die Ware erst noch kommissioniert wird; sie
--    wurde hier nie wieder aufgelöst und hat den freien Bestand dauerhaft
--    kleingerechnet.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Streichpreis
-- -----------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(10, 2)
    CHECK (list_price IS NULL OR list_price >= 0);

COMMENT ON COLUMN public.products.list_price IS
  'Vorher-Preis für die Rabattanzeige (durchgestrichen). NULL oder kleiner/gleich dem aktuellen Preis = keine Reduzierung.';

-- Der Streichpreis gehört – anders als der Ladenpreis aus Migration 022 – ins
-- Schaufenster: Besucher ohne Konto sehen "ab"-Preise (Migration 013) und
-- sollen die Reduzierung genauso sehen wie angemeldete Kunden.
-- Neue Spalte ans Ende, nicht dazwischen (42P16, siehe Migration 009).
CREATE OR REPLACE VIEW public.products_public AS
SELECT id, category_id, sku, name, description, is_active, created_at, updated_at,
       is_new, is_topseller, has_image, list_price
FROM public.products
WHERE is_active = true AND has_image = true;

GRANT SELECT ON public.products_public TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. create_admin_order – Bestand abbuchen statt reservieren
--
--    Sonst identisch zu Migration 016. Geändert sind nur die Bestandsprüfung
--    (freier Bestand statt Reservierung) und das UPDATE am Ende der Schleife.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_admin_order(
  p_customer_id      UUID,
  p_items            JSONB,  -- [{"product_id":"uuid","quantity":25,"unit_price":1.10}, ...]
  p_notes            TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_method  TEXT DEFAULT 'pickup'
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
  v_price   NUMERIC(10, 2);
  v_sub     NUMERIC(12, 2);
  v_total   NUMERIC(12, 2) := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_customer_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keine Positionen angegeben.';
  END IF;

  INSERT INTO public.orders (
    customer_id, status, notes, delivery_address, delivery_method, total_amount
  )
  VALUES (
    p_customer_id,
    'confirmed',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    p_delivery_method,
    0
  )
  RETURNING * INTO v_order;

  FOR v_row IN
    SELECT (item ->> 'product_id')::UUID              AS product_id,
           (item ->> 'quantity')::INT                  AS quantity,
           NULLIF(item ->> 'unit_price', '')::NUMERIC   AS unit_price
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;

    -- Zeilensperre: zwischen Prüfung und Abbuchung darf keine parallele
    -- Bestellung oder ein Kassenverkauf dazwischenfunken.
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_row.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artikel nicht gefunden.';
    END IF;

    v_free := GREATEST(v_product.stock_available - v_product.stock_reserved, 0);
    IF v_row.quantity > v_free THEN
      RAISE EXCEPTION 'Von "%" sind nur noch % Stück verfügbar.',
        v_product.name, v_free;
    END IF;

    v_tier := NULL;

    IF v_row.unit_price IS NOT NULL THEN
      v_price := v_row.unit_price;
    ELSE
      SELECT * INTO v_tier
      FROM public.product_variants
      WHERE product_id = v_product.id AND min_quantity <= v_row.quantity
      ORDER BY min_quantity DESC
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Kein Preis für "%" bei dieser Menge hinterlegt.',
          v_product.name;
      END IF;

      v_price := v_tier.unit_price;
    END IF;

    v_sub := ROUND(v_price * v_row.quantity, 2);
    v_total := v_total + v_sub;

    INSERT INTO public.order_items (
      order_id, product_variant_id, product_name, product_sku,
      quantity, unit_price, subtotal
    )
    VALUES (
      v_order.id, v_tier.id, v_product.name, v_product.sku,
      v_row.quantity, v_price, v_sub
    );

    -- Abbuchen statt reservieren: die Bestellung des Admins ist bereits
    -- 'confirmed', die Ware verlässt damit den Bestand.
    UPDATE public.products
    SET stock_available = stock_available - v_row.quantity
    WHERE id = v_product.id;
  END LOOP;

  UPDATE public.orders
  SET total_amount = v_total
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_order(UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;
