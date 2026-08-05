-- =============================================================================
-- Migration 002 – Bestellung anlegen als Datenbankfunktion
--
-- Warum nicht mehrere Inserts aus der App: Order, Positionen und die
-- Bestandsreservierung müssen zusammen gelingen oder zusammen scheitern.
-- Über PostgREST wären das drei Requests ohne gemeinsame Transaktion – bricht
-- der zweite ab, bleibt eine leere Bestellung stehen.
--
-- Preise kommen ausschließlich aus der DB. Was der Browser im localStorage
-- stehen hat, ist reine Anzeige und wird hier ignoriert.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT);

CREATE FUNCTION public.create_order(
  p_items            JSONB,  -- [{"product_id": "uuid", "quantity": 25}, ...]
  p_notes            TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
-- SECURITY DEFINER, weil die Funktion stock_reserved auf products hochzählt.
-- Kunden haben darauf keine Schreibrechte. Die Berechtigung wird stattdessen
-- unten von Hand geprüft: angemeldet, aktiv, und die Bestellung läuft immer
-- auf auth.uid() – eine fremde customer_id lässt sich nicht unterschieben.
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

  INSERT INTO public.orders (
    customer_id, status, notes, delivery_address, total_amount
  )
  VALUES (
    auth.uid(),
    'submitted',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    0
  )
  RETURNING * INTO v_order;

  -- Derselbe Artikel kann mehrfach im Warenkorb stehen: erst zusammenfassen,
  -- damit Staffelpreis und Bestandsprüfung auf der Gesamtmenge arbeiten.
  FOR v_row IN
    SELECT (item ->> 'product_id')::UUID   AS product_id,
           SUM((item ->> 'quantity')::INT) AS quantity
    FROM jsonb_array_elements(p_items) AS item
    GROUP BY 1
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;

    -- FOR UPDATE sperrt die Zeile bis zum Commit: zwei gleichzeitige
    -- Bestellungen können denselben Bestand nicht doppelt reservieren.
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

    -- Höchste Staffel, deren Mindestmenge erreicht ist (gleiche Regel wie
    -- resolveTier() in lib/pricing.ts).
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

REVOKE ALL ON FUNCTION public.create_order(JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT) TO authenticated;
