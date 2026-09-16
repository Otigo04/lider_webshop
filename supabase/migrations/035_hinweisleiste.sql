-- =============================================================================
-- Migration 035 – Hinweisleiste über der Kopfleiste
--
-- Kurze Botschaften wie „Ab 100 € netto versandkostenfrei" oder „Am 3. Oktober
-- geschlossen". Sie ändern sich öfter als der Quelltext und werden deshalb
-- unter /admin/settings gepflegt, nicht im Code.
--
-- Mehrere Zeilen statt eines Textfelds in company_settings: stehen mehrere
-- Hinweise aktiv, wechselt die Leiste zwischen ihnen. Und company_settings ist
-- nur für angemeldete Nutzer lesbar – die Leiste steht aber auch vor jedem
-- anonymen Besucher.
--
-- tone wählt die Fläche: brand (Wappenblau), gold (Lorbeer), signal (Rot für
-- Aktionen). Kein Hex-Feld – freie Farben gingen an der Markenpalette vorbei.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.site_banners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 160),
  link_url    TEXT CHECK (link_url IS NULL OR char_length(link_url) <= 300),
  link_label  TEXT CHECK (link_label IS NULL OR char_length(link_label) <= 40),
  tone        TEXT NOT NULL DEFAULT 'gold' CHECK (tone IN ('brand', 'gold', 'signal')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_banners_read  ON public.site_banners;
DROP POLICY IF EXISTS site_banners_admin ON public.site_banners;

-- Lesen darf jeder, aber nur aktive Hinweise: ein vorbereiteter, noch nicht
-- freigeschalteter Text soll nicht über die REST-Schnittstelle vorab zu lesen
-- sein. Der Admin sieht über die zweite Policy alle.
CREATE POLICY site_banners_read ON public.site_banners
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY site_banners_admin ON public.site_banners
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.site_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_banners TO authenticated;

DROP TRIGGER IF EXISTS trg_site_banners_updated_at ON public.site_banners;
CREATE TRIGGER trg_site_banners_updated_at
  BEFORE UPDATE ON public.site_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Startwert: die Versandgrenze aus lib/shipping.ts. Nur beim ersten Einspielen.
INSERT INTO public.site_banners (message, link_url, link_label, tone, order_index)
SELECT 'Ab 100 € Nettowarenwert versandkostenfrei', '/versand', 'Details', 'gold', 0
WHERE NOT EXISTS (SELECT 1 FROM public.site_banners);

COMMENT ON TABLE public.site_banners IS
  'Hinweisleiste über der Kopfleiste – gepflegt unter /admin/settings.';
