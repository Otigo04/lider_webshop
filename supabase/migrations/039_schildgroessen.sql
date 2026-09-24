-- =============================================================================
-- Migration 039 – Eigene Schildgrößen für Preisschilder
--
-- Vorher standen drei feste Raster im Quelltext („3 Spalten × 5 Zeilen"). Am
-- Regal wird aber nicht in Spalten gerechnet, sondern mit dem Lineal gemessen,
-- welches Schild in die Schiene passt. Gepflegt werden deshalb Millimeter;
-- wie viele davon auf einen A4-Bogen gehen, rechnet die Anwendung aus.
--
-- Eigene Tabelle und keine Spalte in company_settings: es sind mehrere
-- Formate nebeneinander, und sie kommen über die Zeit dazu – jede neue
-- Regalschiene bringt ihr Maß mit.
--
-- Die obere Grenze im CHECK ist die Nutzfläche eines A4-Bogens innerhalb des
-- Druckrands von 8 mm (194 × 281 mm): ein Schild, das nicht auf das Blatt
-- passt, ließe sich anlegen, aber nie drucken. Die untere von 25 mm ist der
-- Punkt, ab dem Bezeichnung, Preis und Artikelnummer nebeneinander noch
-- lesbar bleiben – darunter wäre es ein Etikett und kein Preisschild.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.label_sizes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  width_mm    NUMERIC(5,1) NOT NULL CHECK (width_mm  BETWEEN 25 AND 194),
  height_mm   NUMERIC(5,1) NOT NULL CHECK (height_mm BETWEEN 25 AND 281),
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.label_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS label_sizes_admin ON public.label_sizes;

-- Nur der Admin, lesend wie schreibend – wie bei den Symbolen aus
-- Migration 038: Schildgrößen sind Werkzeug der Verwaltung und stehen auf
-- keiner Seite, die ein Kunde zu sehen bekommt.
CREATE POLICY label_sizes_admin ON public.label_sizes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_sizes TO authenticated;

DROP TRIGGER IF EXISTS trg_label_sizes_updated_at ON public.label_sizes;
CREATE TRIGGER trg_label_sizes_updated_at
  BEFORE UPDATE ON public.label_sizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Startwerte: die drei bisherigen Formate, in Millimetern ausgedrückt. Nur
-- beim ersten Einspielen – wer sie ändert oder löscht, bekommt sie nicht
-- beim nächsten Deploy zurück.
INSERT INTO public.label_sizes (name, width_mm, height_mm, order_index)
SELECT * FROM (VALUES
  ('Klein',  48.5, 40.0, 0),
  ('Mittel', 64.5, 56.0, 1),
  ('Groß',   97.0, 70.0, 2)
) AS vorgabe(name, width_mm, height_mm, order_index)
WHERE NOT EXISTS (SELECT 1 FROM public.label_sizes);

COMMENT ON TABLE public.label_sizes IS
  'Schildformate in Millimetern – gepflegt unter /admin/preisschilder.';
