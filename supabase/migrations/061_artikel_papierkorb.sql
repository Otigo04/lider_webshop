-- =============================================================================
-- 061: Papierkorb für gelöschte Artikel
--
-- Ein gelöschter Artikel war weg: Zeile, Staffeln, Merkmale, Einkaufspreis und
-- Fotodateien. Jetzt wandert er vorher als Schnappschuss in `deleted_products`
-- und lässt sich von dort mit allem Zubehör zurückholen.
--
-- Bewusst kein „deleted_at" an `products`: der Artikelstamm wird an über
-- vierzig Stellen gelesen (Shop, Kasse, Kataloge, Wareneingang, Scan).
-- Jede davon müsste den Papierkorb ausblenden, und eine vergessene Stelle
-- zeigte gelöschte Ware weiter an oder ließe sie an der Kasse scannen. So
-- ist ein gelöschter Artikel überall wirklich weg – bis jemand ihn holt.
--
-- Der Schnappschuss wird mit to_jsonb() gezogen und mit jsonb_populate_record()
-- zurückgeschrieben: eine später ergänzte Spalte reist von selbst mit.
--
-- Nicht zurück kommen Verknüpfungen, die die Datenbank beim Löschen auf NULL
-- setzt (Wareneingangsjournal, Bon- und Bestellpositionen). Dort steht der
-- Name als Schnappschuss; die Historie bleibt, wie sie war.
--
-- Die Fotodateien bleiben im Speicher liegen, bis der Papierkorb endgültig
-- geleert wird (Aktion purgeDeletedProduct).
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deleted_products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  sku        TEXT NOT NULL,
  name       TEXT NOT NULL,
  barcode    TEXT,
  snapshot   JSONB NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS deleted_products_zeit
  ON public.deleted_products (deleted_at DESC);

ALTER TABLE public.deleted_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deleted_products_admin ON public.deleted_products;
CREATE POLICY deleted_products_admin ON public.deleted_products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, DELETE ON public.deleted_products TO authenticated;

COMMENT ON TABLE public.deleted_products IS
  'Papierkorb: Schnappschuss eines gelöschten Artikels samt Zubehör (Migration 061).';

-- -----------------------------------------------------------------------------
-- Löschen mit Schnappschuss
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_product_with_undo(p_product_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product  JSONB;
  v_trash    UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT to_jsonb(p) INTO v_product FROM public.products p WHERE p.id = p_product_id;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Der Artikel wurde nicht gefunden.';
  END IF;

  INSERT INTO public.deleted_products (product_id, sku, name, barcode, snapshot, deleted_by)
  VALUES (
    p_product_id,
    v_product ->> 'sku',
    v_product ->> 'name',
    NULLIF(v_product ->> 'barcode', ''),
    jsonb_build_object(
      'product', v_product,
      'variants', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.product_variants x WHERE x.product_id = p_product_id), '[]'::jsonb),
      'images', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.product_images x WHERE x.product_id = p_product_id), '[]'::jsonb),
      'flag_links', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.product_flag_links x WHERE x.product_id = p_product_id), '[]'::jsonb),
      'attribute_links', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.product_attribute_links x WHERE x.product_id = p_product_id), '[]'::jsonb),
      'costs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.product_costs x WHERE x.product_id = p_product_id), '[]'::jsonb),
      'catalog_items', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.catalog_items x WHERE x.product_id = p_product_id), '[]'::jsonb)
    ),
    auth.uid()
  )
  RETURNING id INTO v_trash;

  DELETE FROM public.products WHERE id = p_product_id;

  RETURN v_trash;
END;
$$;

-- -----------------------------------------------------------------------------
-- Zurückholen
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_deleted_product(p_trash_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snap     JSONB;
  v_product  JSONB;
  v_id       UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Keine Berechtigung.';
  END IF;

  SELECT snapshot INTO v_snap FROM public.deleted_products WHERE id = p_trash_id;
  IF v_snap IS NULL THEN
    RAISE EXCEPTION 'Der Artikel liegt nicht mehr im Papierkorb.';
  END IF;

  v_product := v_snap -> 'product';
  v_id := (v_product ->> 'id')::UUID;

  IF EXISTS (SELECT 1 FROM public.products WHERE id = v_id) THEN
    RAISE EXCEPTION 'Dieser Artikel ist schon wieder da.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE sku = v_product ->> 'sku') THEN
    RAISE EXCEPTION 'Die Artikelnummer % ist inzwischen vergeben.', v_product ->> 'sku';
  END IF;
  IF NULLIF(v_product ->> 'barcode', '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.products WHERE barcode = v_product ->> 'barcode') THEN
    RAISE EXCEPTION 'Der Barcode % ist inzwischen einem anderen Artikel zugeordnet.', v_product ->> 'barcode';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = (v_product ->> 'category_id')::UUID) THEN
    RAISE EXCEPTION 'Die Warengruppe des Artikels gibt es nicht mehr.';
  END IF;

  -- Das Angebot, zu dem der Artikel gehörte, kann inzwischen gelöscht sein.
  IF NULLIF(v_product ->> 'group_id', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.product_groups WHERE id = (v_product ->> 'group_id')::UUID) THEN
    v_product := v_product || jsonb_build_object('group_id', NULL);
  END IF;

  INSERT INTO public.products
    SELECT * FROM jsonb_populate_record(NULL::public.products, v_product);

  INSERT INTO public.product_variants
    SELECT * FROM jsonb_populate_recordset(NULL::public.product_variants, v_snap -> 'variants');

  INSERT INTO public.product_images
    SELECT * FROM jsonb_populate_recordset(NULL::public.product_images, v_snap -> 'images');

  INSERT INTO public.product_costs
    SELECT * FROM jsonb_populate_recordset(NULL::public.product_costs, v_snap -> 'costs');

  -- Was inzwischen gelöscht wurde (Flag, Merkmalswert, Katalog), fällt weg.
  INSERT INTO public.product_flag_links
    SELECT r.* FROM jsonb_populate_recordset(NULL::public.product_flag_links, v_snap -> 'flag_links') r
    WHERE EXISTS (SELECT 1 FROM public.product_flags f WHERE f.id = r.flag_id)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.product_attribute_links
    SELECT r.* FROM jsonb_populate_recordset(NULL::public.product_attribute_links, v_snap -> 'attribute_links') r
    WHERE EXISTS (SELECT 1 FROM public.product_attribute_values v WHERE v.id = r.value_id)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.catalog_items
    SELECT r.* FROM jsonb_populate_recordset(NULL::public.catalog_items, v_snap -> 'catalog_items') r
    WHERE EXISTS (SELECT 1 FROM public.catalogs c WHERE c.id = r.catalog_id)
    ON CONFLICT DO NOTHING;

  DELETE FROM public.deleted_products WHERE id = p_trash_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_product_with_undo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_deleted_product(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_product_with_undo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_product(UUID) TO authenticated;
