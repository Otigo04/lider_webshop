-- =============================================================================
-- 076 – Willkommensgutschein für neue Newsletter-Abonnenten
--
-- 1. vouchers.nur_erstbestellung: Gutschein gilt nur, wenn der Kunde noch keine
--    Bestellung hat. Geprüft in gutschein_pruefen() – der einen Stelle, die
--    create_order() und die Vorschau im Warenkorb gemeinsam nutzen.
-- 2. vouchers.fuer_newsletter: dieser Gutschein geht an neue Abonnenten.
--    Höchstens einer. Der Code selbst geht nie an Besucher.
-- 3. users.newsletter_gutschein_at: der Code wurde schon geschickt (einmal je
--    Konto). Bestehende Abonnenten gelten als bedient.
-- 4. newsletter_angebot(): was der Gutschein wert ist – für die Texte auf
--    Startseite und Registrierung, ohne Code. mein_newsletter_gutschein():
--    der Code für das eigene Konto, solange er einlösbar ist.
-- 5. Der Gutschein NEWSLETTER5 (5 € fest, ab 50 € netto, Erstbestellung).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS nur_erstbestellung BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fuer_newsletter    BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_fuer_newsletter_einzig
  ON public.vouchers ((true)) WHERE fuer_newsletter;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS newsletter_gutschein_at TIMESTAMPTZ;

UPDATE public.users
SET newsletter_gutschein_at = COALESCE(newsletter_abo_at, now())
WHERE newsletter_abo AND newsletter_gutschein_at IS NULL;

-- -----------------------------------------------------------------------------
-- gutschein_pruefen() – wie Migration 054, dazu die Prüfung auf Erstbestellung.
-- Signatur unverändert, CREATE OR REPLACE ersetzt an Ort und Stelle.
--
-- Beim Bestellen liegt die neue Bestellung schon in orders (gleiche
-- Transaktion). Sie zählt nicht mit: created_at = now() = Beginn dieser
-- Transaktion, frühere Bestellungen sind strikt älter.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gutschein_pruefen(
  p_code     TEXT,
  p_customer UUID,
  p_warenwert NUMERIC,
  p_sperren  BOOLEAN DEFAULT false
)
RETURNS public.vouchers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code     TEXT := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v          public.vouchers;
  v_gesamt   INT;
  v_eigene   INT;
BEGIN
  IF p_sperren THEN
    -- Sperre gegen zwei gleichzeitige Bestellungen mit dem letzten freien
    -- Einlöseplatz.
    SELECT * INTO v FROM public.vouchers WHERE code = v_code FOR UPDATE;
  ELSE
    SELECT * INTO v FROM public.vouchers WHERE code = v_code;
  END IF;

  -- Ein fremder, kundengebundener Code meldet dasselbe wie ein unbekannter:
  -- dass es ihn gibt, geht den Fragenden nichts an.
  IF NOT FOUND OR NOT v.is_active
     OR (v.customer_id IS NOT NULL AND v.customer_id IS DISTINCT FROM p_customer) THEN
    RAISE EXCEPTION 'Dieser Gutscheincode ist ungültig.';
  END IF;

  IF v.valid_from IS NOT NULL AND v.valid_from > now() THEN
    RAISE EXCEPTION 'Dieser Gutschein gilt erst ab %.',
      to_char(v.valid_from AT TIME ZONE public.pos_zeitzone(), 'DD.MM.YYYY');
  END IF;

  IF v.valid_until IS NOT NULL AND v.valid_until <= now() THEN
    RAISE EXCEPTION 'Dieser Gutschein ist abgelaufen.';
  END IF;

  IF v.max_redemptions IS NOT NULL THEN
    SELECT COUNT(*) INTO v_gesamt FROM public.orders WHERE voucher_id = v.id;
    IF v_gesamt >= v.max_redemptions THEN
      RAISE EXCEPTION 'Dieser Gutschein ist bereits vollständig eingelöst.';
    END IF;
  END IF;

  IF v.max_per_customer IS NOT NULL THEN
    SELECT COUNT(*) INTO v_eigene
    FROM public.orders
    WHERE voucher_id = v.id AND customer_id = p_customer;
    IF v_eigene >= v.max_per_customer THEN
      RAISE EXCEPTION 'Sie haben diesen Gutschein bereits eingelöst.';
    END IF;
  END IF;

  IF v.nur_erstbestellung AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.customer_id = p_customer
      AND o.status NOT IN ('draft', 'cancelled')
      AND o.created_at < now()
  ) THEN
    RAISE EXCEPTION 'Dieser Gutschein gilt nur für die erste Bestellung.';
  END IF;

  IF p_warenwert IS NOT NULL AND p_warenwert < v.min_order_amount THEN
    RAISE EXCEPTION 'Der Gutschein gilt ab einem Warenwert von % € netto.',
      replace(to_char(v.min_order_amount, 'FM999999990.00'), '.', ',');
  END IF;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.gutschein_pruefen(TEXT, UUID, NUMERIC, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Angebot für die Texte: Art, Wert, Mindestwert – nie der Code.
-- NULL, wenn kein Newsletter-Gutschein läuft.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.newsletter_angebot()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'kind', v.kind,
    'value', v.value,
    'min_order_amount', v.min_order_amount,
    'nur_erstbestellung', v.nur_erstbestellung,
    'begrenzt', cardinality(v.category_ids) > 0
  )
  FROM public.vouchers v
  WHERE v.fuer_newsletter
    AND v.is_active
    AND v.customer_id IS NULL
    AND (v.valid_from  IS NULL OR v.valid_from <= now())
    AND (v.valid_until IS NULL OR v.valid_until > now())
    AND (v.max_redemptions IS NULL
         OR (SELECT COUNT(*) FROM public.orders o WHERE o.voucher_id = v.id) < v.max_redemptions)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.newsletter_angebot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.newsletter_angebot() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Der Code für das eigene Konto: nur wer abonniert hat, und nur solange
-- gutschein_pruefen() ihn für diesen Kunden durchließe.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mein_newsletter_gutschein()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT v.code INTO v_code
  FROM public.vouchers v
  JOIN public.users u ON u.id = auth.uid()
  WHERE v.fuer_newsletter AND v.customer_id IS NULL
    AND u.newsletter_abo AND u.is_active
    -- Bestehende Abonnenten (Backfill oben, Zeitstempel älter als der
    -- Gutschein) gehen leer aus. Noch nicht verschickt (NULL, z. B. weil die
    -- Mail scheiterte) zählt: dann steht der Code im Konto.
    AND (u.newsletter_gutschein_at IS NULL OR u.newsletter_gutschein_at >= v.created_at);
  IF v_code IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    PERFORM public.gutschein_pruefen(v_code, auth.uid(), NULL, false);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.mein_newsletter_gutschein() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mein_newsletter_gutschein() TO authenticated;

-- -----------------------------------------------------------------------------
-- Der Gutschein selbst. Nur anlegen, wenn es noch keinen Newsletter-Gutschein
-- und den Code nicht gibt – ein von Hand angepasster bleibt unangetastet.
-- -----------------------------------------------------------------------------
INSERT INTO public.vouchers
  (code, description, kind, value, min_order_amount, max_per_customer,
   nur_erstbestellung, fuer_newsletter, is_active)
SELECT 'NEWSLETTER5', 'Willkommensgutschein für neue Newsletter-Abonnenten',
       'fixed', 5, 50, 1, true, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.vouchers WHERE code = 'NEWSLETTER5' OR fuer_newsletter
);
