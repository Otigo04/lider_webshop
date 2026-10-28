-- =============================================================================
-- 077 – Preis auf Anfrage
--
-- 1. products.price_on_request: der Preis des Artikels steht nicht im Shop.
--    Statt Preis und Warenkorb zeigt der Shop „Preis auf Anfrage" und einen
--    Knopf, der eine Mail an LIDER öffnet. Die Preise selbst bleiben am Artikel
--    gepflegt (Kasse, Rechnung aus Katalog, Preisschild rechnen damit weiter);
--    nur der Shop blendet sie aus (lib/queries/products.ts).
-- 2. order_items: ein Kunde kann einen solchen Artikel nicht bestellen – auch
--    nicht mit einem alten Warenkorb oder einem selbst gebauten Aufruf. Das
--    macht ein BEFORE-INSERT-Trigger wie bei der Vorbestellung (Migration 066),
--    create_order() bleibt unverändert. Admins (Rechnung aus Katalog) sind
--    davon ausgenommen.
-- 3. preis_auf_anfrage(ids): welche Artikel sind „auf Anfrage"? Auch für
--    Besucher lesbar, damit sie „Preis auf Anfrage" statt „Preis nach
--    Anmeldung" sehen. Der Shop fragt damit, nicht über die View
--    products_public – so bricht er nicht, wenn der Code vor der Migration läuft.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_on_request BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.price_on_request IS
  'Preis auf Anfrage (Migration 077): im Shop kein Preis, nicht bestellbar, Knopf „Preis anfragen".';

CREATE INDEX IF NOT EXISTS idx_products_price_on_request
  ON public.products (price_on_request) WHERE price_on_request;

-- Welche dieser Artikel sind „auf Anfrage"? Eine Funktion statt einer neuen
-- Spalte in products_public: Besucher und Kunden fragen damit auf demselben Weg,
-- und fehlt die Migration noch, läuft der Shop ohne Fehler weiter (der Aufruf
-- liefert dann nichts). Gibt nur Artikel heraus, die im Shop zu sehen sind.
CREATE OR REPLACE FUNCTION public.preis_auf_anfrage(p_ids UUID[])
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id
  FROM public.products p
  WHERE p.id = ANY (p_ids)
    AND p.price_on_request
    AND p.is_active
    AND p.has_image;
$$;

REVOKE ALL ON FUNCTION public.preis_auf_anfrage(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preis_auf_anfrage(UUID[]) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Bestellung durch Kunden sperren
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_preis_auf_anfrage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.product_variant_id IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_name
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.product_variant_id AND p.price_on_request;

  IF FOUND THEN
    RAISE EXCEPTION 'Der Artikel „%" gibt es nur auf Anfrage und lässt sich nicht bestellen. Bitte fragen Sie den Preis bei uns an.', v_name;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS order_items_preis_auf_anfrage ON public.order_items;
CREATE TRIGGER order_items_preis_auf_anfrage
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_preis_auf_anfrage();
