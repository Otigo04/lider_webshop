-- =============================================================================
-- Migration 048 – Verkauf ohne Bestand
--
-- Bisher lehnte create_pos_sale() eine Zeile ab, sobald die Menge den freien
-- Bestand überstieg ("Von X sind nur noch 0 Stück verfügbar."). Am Tresen ist
-- das die falsche Reihenfolge: der Kunde steht mit der Ware in der Hand, der
-- Artikel ist im System nur noch nicht nachgetragen (Inventurdifferenz,
-- Wareneingang noch nicht gebucht, Reservierung einer Onlinebestellung). Der
-- Verkauf soll trotzdem gebucht werden, als wäre der Bestand da – nur der
-- Bestand selbst bleibt bei 0 stehen, statt unter 0 zu fallen.
--
-- Die tatsächlich verkaufte Menge geht nicht verloren: sie steht wie immer in
-- pos_sale_items. Nur products.stock_available – eine reine Vorratszahl –
-- darf laut CHECK-Constraint nicht negativ werden, deshalb GREATEST(..., 0).
--
-- Im Supabase SQL Editor ausführen. Idempotent (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_pos_sale(
  p_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_customer_label TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_note TEXT DEFAULT NULL
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row     RECORD;
  v_product public.products;
  v_sale    public.pos_sales;
  v_rate    NUMERIC;
  v_summe   NUMERIC := 0;
  v_sub     NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Der Bon ist leer.';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card', 'transfer') THEN
    RAISE EXCEPTION 'Ungültige Zahlart.';
  END IF;

  SELECT COALESCE(pos_vat_rate, 19) INTO v_rate FROM public.company_settings LIMIT 1;
  v_rate := COALESCE(v_rate, 19);

  INSERT INTO public.pos_sales (
    customer_id, customer_label, cashier_id, payment_method,
    vat_rate, net_amount, vat_amount, total_amount, note
  )
  VALUES (
    p_customer_id,
    NULLIF(btrim(COALESCE(p_customer_label, '')), ''),
    auth.uid(),
    p_payment_method,
    v_rate, 0, 0, 0,
    NULLIF(btrim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_sale;

  FOR v_row IN
    SELECT NULLIF(item ->> 'product_id', '')::UUID AS product_id,
           item ->> 'name'                         AS name,
           item ->> 'sku'                          AS sku,
           NULLIF(item ->> 'barcode', '')          AS barcode,
           (item ->> 'quantity')::INT              AS quantity,
           (item ->> 'unit_price')::NUMERIC        AS unit_price
    FROM jsonb_array_elements(p_items) AS item
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge.';
    END IF;
    IF v_row.unit_price IS NULL OR v_row.unit_price < 0 THEN
      RAISE EXCEPTION 'Ungültiger Preis.';
    END IF;

    IF v_row.product_id IS NOT NULL THEN
      SELECT * INTO v_product
      FROM public.products
      WHERE id = v_row.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Artikel nicht gefunden.';
      END IF;

      -- Kein Abbruch mehr bei knappem oder fehlendem Bestand: der Verkauf
      -- wird gebucht, als wäre die Ware da. Der Bestand fällt dabei nicht
      -- unter 0 – das ist eine Vorratszahl, keine Schuld –, aber die Zeile
      -- auf dem Bon zählt mit dem vollen Preis.
      UPDATE public.products
      SET stock_available = GREATEST(stock_available - v_row.quantity, 0)
      WHERE id = v_product.id;
    ELSE
      v_product := NULL;
    END IF;

    v_sub   := ROUND(v_row.unit_price * v_row.quantity, 2);
    v_summe := v_summe + v_sub;

    INSERT INTO public.pos_sale_items (
      sale_id, product_id, product_name, product_sku, barcode,
      quantity, unit_price, subtotal
    )
    VALUES (
      v_sale.id,
      v_row.product_id,
      COALESCE(NULLIF(btrim(COALESCE(v_row.name, '')), ''), v_product.name, 'Position'),
      COALESCE(NULLIF(btrim(COALESCE(v_row.sku, '')), ''), v_product.sku, '-'),
      COALESCE(v_row.barcode, v_product.barcode),
      v_row.quantity, v_row.unit_price, v_sub
    );
  END LOOP;

  UPDATE public.pos_sales
  SET net_amount   = ROUND(v_summe / (1 + v_rate / 100), 2),
      vat_amount   = v_summe - ROUND(v_summe / (1 + v_rate / 100), 2),
      total_amount = v_summe
  WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$$;
