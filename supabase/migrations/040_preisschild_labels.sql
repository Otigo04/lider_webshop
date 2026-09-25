-- =============================================================================
-- Migration 040 – Farbige Labels auf Preisschildern
--
-- Ein Preisschild kann ein Label tragen: „Neu", „Topseller" oder eines der
-- frei angelegten Artikel-Flags (Migration 021). Die Labels selbst gibt es
-- schon – hier wird nur festgehalten, in welcher Farbe sie auf dem Schild
-- stehen.
--
-- Eigene Tabelle statt einer Spalte an product_flags: „Neu" und „Topseller"
-- sind keine Zeilen dort, sondern feste Spalten am Artikel (Migration 009/010).
-- Zwei Ablageorte für dieselbe Sorte Farbe liefen auseinander.
--
-- Schlüssel: 'neu', 'topseller' oder 'flag:<uuid>'. Kein Fremdschlüssel –
-- wird ein Flag gelöscht, bleibt eine verwaiste Farbzeile zurück, und die
-- stört niemanden.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.label_badge_colors (
  badge_key  TEXT PRIMARY KEY
             CHECK (badge_key ~ '^(neu|topseller|flag:[0-9a-f-]{36})$'),
  color      TEXT NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.label_badge_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS label_badge_colors_admin ON public.label_badge_colors;

-- Nur der Admin, wie Symbole und Schildgrößen: Werkzeug der Verwaltung.
CREATE POLICY label_badge_colors_admin ON public.label_badge_colors
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_badge_colors TO authenticated;

COMMENT ON TABLE public.label_badge_colors IS
  'Farbe je Label auf Preisschildern – gepflegt unter /admin/preisschilder.';
