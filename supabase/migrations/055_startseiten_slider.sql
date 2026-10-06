-- =============================================================================
-- 055 – Werbebilder oben auf der Startseite (Slider)
--
-- Gepflegt unter /admin/startseite, angezeigt von components/home-slider.tsx.
-- Bilder liegen im privaten Bucket products unter startseite/<uuid>.<ext>
-- und werden wie Produktfotos signiert (lib/storage.ts).
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.home_slides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Text ist optional: viele Werbebilder tragen ihre Botschaft schon im Bild.
  title             TEXT CHECK (title IS NULL OR char_length(title) <= 90),
  subtitle          TEXT CHECK (subtitle IS NULL OR char_length(subtitle) <= 200),
  cta_label         TEXT CHECK (cta_label IS NULL OR char_length(cta_label) <= 40),
  -- interner Pfad (/shop/reduziert) oder https://… – prüft die Server Action
  link_url          TEXT CHECK (link_url IS NULL OR char_length(link_url) <= 300),
  image_path        TEXT NOT NULL,
  -- eigener Zuschnitt fürs Telefon (Hochformat); ohne wird image_path beschnitten
  mobile_image_path TEXT,
  -- Fläche hinter dem Text: dunkel (weiße Schrift) oder hell (dunkle Schrift)
  tone              TEXT NOT NULL DEFAULT 'dark' CHECK (tone IN ('dark', 'light')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  order_index       INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

DROP TRIGGER IF EXISTS trg_home_slides_updated_at ON public.home_slides;
CREATE TRIGGER trg_home_slides_updated_at
  BEFORE UPDATE ON public.home_slides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_slides ENABLE ROW LEVEL SECURITY;

-- Wie site_banners (Migration 035): Besucher sehen nur, was gerade läuft. Eine
-- vorbereitete Aktion soll nicht vorab über die REST-Schnittstelle zu lesen sein.
DROP POLICY IF EXISTS home_slides_read  ON public.home_slides;
DROP POLICY IF EXISTS home_slides_admin ON public.home_slides;
CREATE POLICY home_slides_read ON public.home_slides
  FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now())
  );
CREATE POLICY home_slides_admin ON public.home_slides
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.home_slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_slides TO authenticated;

-- Bilder unter startseite/ sind für alle lesbar – sie stehen auf der
-- öffentlichen Startseite. Der übrige Bucket bleibt wie gehabt.
DROP POLICY IF EXISTS "home slides read public" ON storage.objects;
CREATE POLICY "home slides read public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'products'
    AND (storage.foldername(name))[1] = 'startseite'
  );
