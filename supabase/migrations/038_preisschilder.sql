-- =============================================================================
-- Migration 038 – Preisschilder: gespeicherte Symbole
--
-- Der Generator unter /admin/preisschilder zieht Bezeichnung, Preis, Streich-
-- preis und Artikelnummer aus `products`. Dafür braucht es keine neue Spalte:
-- ein Preisschild ist eine Momentaufnahme fürs Regal, kein Stammdatum. Wird der
-- Preis geändert, wird neu gedruckt – eine gespeicherte Schilderliste wäre nur
-- eine zweite Wahrheit, die still veraltet.
--
-- Was bleiben muss, sind die Symbole: das LEGO-Zeichen, das Pfandsymbol, ein
-- Aktionsstern. Wer sie bei jedem Druck neu vom Rechner heraussuchen müsste,
-- ließe sie bald weg. Deshalb eine kleine Bibliothek: einmal hochladen, danach
-- aus der Liste anklicken.
--
-- Die Datei liegt im vorhandenen Bucket `products` unter `etiketten/…`. Eigene
-- Storage-Policies braucht es nicht – „product images admin write" deckt den
-- ganzen Bucket ab (Migration 027).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.label_icons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  file_path  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.label_icons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS label_icons_admin ON public.label_icons;

-- Nur der Admin, lesend wie schreibend: Symbole sind Werkzeug der Verwaltung
-- und stehen auf keiner Seite, die ein Kunde zu sehen bekommt.
CREATE POLICY label_icons_admin ON public.label_icons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_icons TO authenticated;

COMMENT ON TABLE public.label_icons IS
  'Symbolbibliothek für Preisschilder – gepflegt unter /admin/preisschilder.';
COMMENT ON COLUMN public.label_icons.file_path IS
  'Storage-Pfad im Bucket products, z. B. etiketten/<uuid>.png';
