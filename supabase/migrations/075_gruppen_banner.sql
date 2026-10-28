-- =============================================================================
-- 075 – Banner oben auf der Seite einer Warengruppe
--
-- Gepflegt unter /admin/startseite/gruppen, angezeigt auf /shop/[category]
-- von components/home-slider.tsx (Format "gruppe", 5:1). Aufbau wie
-- home_slides (Migration 055), dazu die Warengruppe. Eine Warengruppe ohne
-- laufendes Banner zeigt oben nichts.
--
-- Bilder liegen im Bucket products unter kategorien-banner/<uuid>.<ext>.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_banners (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title             TEXT CHECK (title IS NULL OR char_length(title) <= 90),
  subtitle          TEXT CHECK (subtitle IS NULL OR char_length(subtitle) <= 200),
  cta_label         TEXT CHECK (cta_label IS NULL OR char_length(cta_label) <= 40),
  link_url          TEXT CHECK (link_url IS NULL OR char_length(link_url) <= 300),
  image_path        TEXT NOT NULL,
  mobile_image_path TEXT,
  tone              TEXT NOT NULL DEFAULT 'dark' CHECK (tone IN ('dark', 'light')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  order_index       INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS category_banners_category_idx
  ON public.category_banners (category_id, order_index);

DROP TRIGGER IF EXISTS trg_category_banners_updated_at ON public.category_banners;
CREATE TRIGGER trg_category_banners_updated_at
  BEFORE UPDATE ON public.category_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.category_banners ENABLE ROW LEVEL SECURITY;

-- Wie home_slides: Besucher sehen nur, was gerade läuft.
DROP POLICY IF EXISTS category_banners_read  ON public.category_banners;
DROP POLICY IF EXISTS category_banners_admin ON public.category_banners;
CREATE POLICY category_banners_read ON public.category_banners
  FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now())
  );
CREATE POLICY category_banners_admin ON public.category_banners
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.category_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_banners TO authenticated;

-- Bilder unter kategorien-banner/ stehen auf öffentlich erreichbaren
-- Warengruppenseiten und sind deshalb für alle lesbar. Der übrige Bucket
-- bleibt wie gehabt.
DROP POLICY IF EXISTS "category banners read public" ON storage.objects;
CREATE POLICY "category banners read public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'products'
    AND (storage.foldername(name))[1] = 'kategorien-banner'
  );
