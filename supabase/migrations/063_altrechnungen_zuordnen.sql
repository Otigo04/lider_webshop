-- =============================================================================
-- 063: Alte Rechnungen und Kassenverkäufe als Bestellung einem Kunden zuordnen
--
-- Vor dem Bestellablauf entstanden Rechnungen am Shop vorbei: als freie
-- Rechnung (invoices.type = 'manual') oder als Kassenverkauf ohne Konto. Der
-- Kunde sieht aber nur Bestellungen. Diese Funktionen legen zu einem solchen
-- Beleg eine Bestellung an (Status „geliefert“, Datum des Belegs) und
-- verknüpfen beides:
--
--   - Freie Rechnung: invoices.order_id zeigt auf die neue Bestellung. Die
--     Rechnungsnummer und das gespeicherte PDF bleiben unangetastet – eine
--     vergebene Nummer wird nie umgeschrieben. Der Kunde sieht Bestellung und
--     Rechnung mit Download.
--   - Kassenverkauf: pos_sales.order_id zeigt auf die neue Bestellung (neue
--     Spalte). pos_sales.customer_id bleibt, wie es war: der Beleg wurde unter
--     der Annahme „Laufkunde, Preise brutto“ gedruckt, und ein nachträglich
--     gesetztes Konto würde ihn beim Neuzeichnen anders lesen. Die Bestellung
--     trägt die Nettobeträge (Bestellungen führen netto); sind die Preise des
--     Verkaufs brutto erfasst, werden sie herausgerechnet.
--
-- Es wird nichts gebucht: kein Bestand, keine Kasse, keine Mail. Die
-- Nummernkreise laufen weiter (die Bestellnummer ist neu, Rechnungs- und
-- Belegnummern bleiben).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_order_unique
  ON public.pos_sales (order_id) WHERE order_id IS NOT NULL;

COMMENT ON COLUMN public.pos_sales.order_id IS
  'Bestellung, unter der der Kunde diesen Kassenverkauf einsieht (Migration 063).';

-- -----------------------------------------------------------------------------
-- 1. Freie Rechnung → Bestellung
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_invoice_to_order(
  p_invoice_id  UUID,
  p_customer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv   public.invoices;
  v_order UUID;
  v_net   NUMERIC(12, 2);
  v_vat   NUMERIC(12, 2);
  v_rate  NUMERIC(5, 2);
  v_row   RECORD;
  v_qty   INT;
  v_price NUMERIC(10, 2);
  v_name  TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rechnung nicht gefunden.';
  END IF;
  IF v_inv.type <> 'manual' THEN
    RAISE EXCEPTION 'Nur freie Rechnungen lassen sich so zuordnen.';
  END IF;
  IF v_inv.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Diese Rechnung gehört schon zu einer Bestellung.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_customer_id AND role = 'customer') THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  v_net := COALESCE(v_inv.net_amount, 0);
  v_vat := COALESCE(v_inv.vat_amount, 0);
  -- Eine Bestellung kennt einen Satz; die freie Rechnung darf je Zeile einen
  -- anderen haben. Der mittlere Satz reproduziert den Bruttobetrag der
  -- Rechnung, maßgeblich bleibt aber ihr PDF.
  v_rate := CASE WHEN v_net > 0 THEN ROUND(v_vat / v_net * 100, 2) ELSE 0 END;

  INSERT INTO public.orders (
    customer_id, status, total_amount, notes,
    delivery_method, payment_method, vat_rate, created_at, updated_at
  )
  VALUES (
    p_customer_id, 'delivered', v_net,
    'Nachträglich aus Rechnung ' || v_inv.invoice_number || ' angelegt.'
      || COALESCE(E'\n' || NULLIF(btrim(v_inv.notes), ''), ''),
    'pickup', 'transfer', v_rate, v_inv.issued_at, v_inv.issued_at
  )
  RETURNING id INTO v_order;

  FOR v_row IN
    SELECT description, quantity, unit_price, subtotal
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
    ORDER BY created_at, id
  LOOP
    IF v_row.quantity >= 1 AND v_row.quantity = TRUNC(v_row.quantity) THEN
      v_qty   := v_row.quantity::INT;
      v_price := v_row.unit_price;
      v_name  := v_row.description;
    ELSE
      -- Bestellpositionen zählen in ganzen Stück; eine Menge wie 2,5 bleibt
      -- als eine Position mit dem Zeilenbetrag und dem Hinweis im Namen.
      v_qty   := 1;
      v_price := v_row.subtotal;
      v_name  := v_row.description || ' (' || v_row.quantity::TEXT || ' × '
                   || v_row.unit_price::TEXT || ' €)';
    END IF;

    INSERT INTO public.order_items (
      order_id, product_variant_id, product_name, product_sku,
      quantity, unit_price, subtotal
    )
    VALUES (v_order, NULL, v_name, '–', v_qty, v_price, v_row.subtotal);
  END LOOP;

  UPDATE public.invoices
  SET order_id = v_order, customer_id = p_customer_id
  WHERE id = p_invoice_id;

  RETURN v_order;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Kassenverkauf → Bestellung
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_pos_sale_to_order(
  p_sale_id     UUID,
  p_customer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale     public.pos_sales;
  v_order    UUID;
  v_sum      NUMERIC(12, 2);
  v_rabatt   NUMERIC(12, 2);
  v_basis    NUMERIC(12, 2);
  v_brutto   BOOLEAN;
  v_faktor   NUMERIC;
  v_row      RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verkauf nicht gefunden.';
  END IF;
  IF v_sale.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dieser Verkauf ist schon einer Bestellung zugeordnet.';
  END IF;
  IF v_sale.customer_id IS NOT NULL AND v_sale.customer_id <> p_customer_id THEN
    RAISE EXCEPTION 'Dieser Verkauf gehört bereits zu einem anderen Kunden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_customer_id AND role = 'customer') THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_sum
  FROM public.pos_sale_items WHERE sale_id = p_sale_id;

  v_rabatt := COALESCE(v_sale.customer_discount_amount, 0);
  v_basis  := COALESCE(v_sale.subtotal_amount, v_sum) - v_rabatt;

  -- Waren die Preise brutto erfasst? Dann stimmt der Gesamtbetrag mit der
  -- Summe der Positionen überein, der Nettobetrag nicht (create_pos_sale).
  v_brutto := v_sale.vat_rate > 0
          AND ABS(v_sale.total_amount - v_basis) <= 0.02
          AND ABS(v_sale.net_amount   - v_basis) >  0.02;
  v_faktor := CASE WHEN v_brutto THEN 1 / (1 + v_sale.vat_rate / 100) ELSE 1 END;

  INSERT INTO public.orders (
    customer_id, status, total_amount, notes,
    delivery_method, payment_method, vat_rate,
    subtotal_amount, customer_discount_percent, customer_discount_amount,
    created_at, updated_at
  )
  VALUES (
    p_customer_id, 'delivered', v_sale.net_amount,
    'Kassenbeleg ' || v_sale.receipt_number
      || COALESCE(' · ' || NULLIF(btrim(v_sale.note), ''), '')
      || COALESCE(' (' || NULLIF(btrim(v_sale.customer_label), '') || ')', '')
      || ' nachträglich zugeordnet.',
    'pickup', v_sale.payment_method, v_sale.vat_rate,
    CASE WHEN v_rabatt > 0 THEN ROUND(COALESCE(v_sale.subtotal_amount, v_sum) * v_faktor, 2) END,
    COALESCE(v_sale.customer_discount_percent, 0),
    ROUND(v_rabatt * v_faktor, 2),
    v_sale.created_at, v_sale.created_at
  )
  RETURNING id INTO v_order;

  FOR v_row IN
    SELECT product_name, product_sku, quantity, unit_price, subtotal
    FROM public.pos_sale_items
    WHERE sale_id = p_sale_id
    ORDER BY created_at, id
  LOOP
    INSERT INTO public.order_items (
      order_id, product_variant_id, product_name, product_sku,
      quantity, unit_price, subtotal
    )
    VALUES (
      v_order, NULL, v_row.product_name, v_row.product_sku, v_row.quantity,
      ROUND(v_row.unit_price * v_faktor, 2), ROUND(v_row.subtotal * v_faktor, 2)
    );
  END LOOP;

  UPDATE public.pos_sales SET order_id = v_order WHERE id = p_sale_id;

  -- Gibt es zu dem Verkauf schon eine Rechnung (Migration 050), hängt sie an
  -- derselben Bestellung.
  UPDATE public.invoices
  SET order_id = v_order
  WHERE pos_sale_id = p_sale_id AND order_id IS NULL;

  RETURN v_order;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Rechnung zu einem Kassenverkauf: hängt an der Bestellung, falls der
--    Verkauf schon zugeordnet ist (sonst sähe der Kunde sie nicht dort).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_for_pos_sale(p_sale_id UUID)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale    public.pos_sales;
  v_invoice public.invoices;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verkauf nicht gefunden.';
  END IF;

  IF v_sale.customer_id IS NULL THEN
    RAISE EXCEPTION 'Dieser Verkauf hat kein Kundenkonto – dafür gibt es den Beleg.';
  END IF;

  INSERT INTO public.invoices (
    pos_sale_id, customer_id, type, net_amount, vat_amount, total_amount, order_id
  )
  VALUES (
    p_sale_id, v_sale.customer_id, 'pos',
    v_sale.net_amount, v_sale.vat_amount, v_sale.total_amount, v_sale.order_id
  )
  ON CONFLICT (pos_sale_id) DO UPDATE SET pos_sale_id = EXCLUDED.pos_sale_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_invoice_to_order(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_pos_sale_to_order(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_invoice_for_pos_sale(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_invoice_to_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_pos_sale_to_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_pos_sale(UUID) TO authenticated;
