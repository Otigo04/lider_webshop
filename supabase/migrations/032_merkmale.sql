-- =============================================================================
-- Migration 032 – Merkmale von Artikeln
--
-- Bisher trägt ein Artikel Bezeichnung, Beschreibung und Preise. Was im Laden
-- tatsächlich den Unterschied macht – Farbe, Größe, Material –, steckte
-- allenfalls im Fließtext. Damit lässt sich weder filtern noch etwas zeigen:
-- „rot" mitten in einem Beschreibungssatz ist für den Shop kein Merkmal,
-- sondern ein Wort.
--
-- Aufbau in drei Ebenen, weil die Werte gepflegt und nicht getippt werden:
--
--   product_attributes        „Farbe", „Größe", „Material"  – was gefragt wird
--   product_attribute_values  „Rot" #c0392b, „XL"           – was zur Auswahl steht
--   product_attribute_links   Artikel ↔ Wert                – was zutrifft
--
-- Ein Freitextfeld am Artikel wäre einfacher gewesen und hätte nach zwei
-- Wochen „rot", „Rot", „ROT" und „rot/orange" nebeneinander stehen. Aus einer
-- gepflegten Werteliste wird dagegen von allein eine saubere Filterleiste.
--
-- Warum kein Bestand je Wert: `products` führt eine Bestandszahl, und Kasse,
-- Wareneingang und Bestellungen buchen darauf. Merkmale beschreiben den
-- Artikel, sie zerlegen ihn nicht in Untervarianten – dafür legt man zwei
-- Artikel an.
--
-- Enthalten:
--   1. product_attributes        – die Merkmale selbst
--   2. product_attribute_values  – ihre Werte, Farben mit Hex-Wert
--   3. product_attribute_links   – Zuordnung zum Artikel
--   4. RLS                       – lesen darf jeder, schreiben nur der Admin
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Merkmale
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_attributes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  -- 'color' zeichnet die Werte als Farbkreise, 'text' als Schildchen. Mehr
  -- Darstellungsarten braucht es nicht: was keine Farbe ist, ist ein Wort.
  kind        TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('color', 'text')),
  order_index INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

-- -----------------------------------------------------------------------------
-- 2. Werte
--
-- `hex` gehört zum Wert und nicht zum Merkmal: „Rot" ist immer derselbe
-- Farbkreis, egal an welchem Artikel er hängt. Bei kind = 'text' bleibt er
-- leer; ein CHECK erzwingt das nicht, weil das Merkmal nachträglich von
-- 'text' auf 'color' umgestellt werden können soll, ohne dass gepflegte
-- Farben dabei verloren gehen.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_attribute_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  -- Sechsstellig mit Raute, so wie es aus <input type="color"> herauskommt.
  hex          TEXT CHECK (hex IS NULL OR hex ~ '^#[0-9A-Fa-f]{6}$'),
  order_index  INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attribute_id, label)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute
  ON public.product_attribute_values (attribute_id, order_index);

-- -----------------------------------------------------------------------------
-- 3. Zuordnung
--
-- Mehrere Werte je Merkmal sind erlaubt (ein Artikel kann „rot und blau"
-- sein). Der Primärschlüssel verhindert nur, dass derselbe Wert zweimal
-- hängt.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_attribute_links (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  value_id   UUID NOT NULL REFERENCES public.product_attribute_values(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, value_id)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_links_value
  ON public.product_attribute_links (value_id);

-- -----------------------------------------------------------------------------
-- 4. RLS
--
-- Anders als die Artikel-Flags aus Migration 021 sind Merkmale nach außen
-- gerichtet: sie stehen auf der Artikelseite und in der Filterspalte des
-- Sortiments, auch für Besucher ohne Konto. Gelesen werden darf deshalb frei –
-- eine Farbe ist keine Betriebsinterne. Preise, Bestände und Kundendaten
-- hängen an keiner dieser Tabellen.
-- -----------------------------------------------------------------------------

ALTER TABLE public.product_attributes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_links  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_attributes_read       ON public.product_attributes;
DROP POLICY IF EXISTS product_attributes_admin      ON public.product_attributes;
DROP POLICY IF EXISTS product_attribute_values_read  ON public.product_attribute_values;
DROP POLICY IF EXISTS product_attribute_values_admin ON public.product_attribute_values;
DROP POLICY IF EXISTS product_attribute_links_read   ON public.product_attribute_links;
DROP POLICY IF EXISTS product_attribute_links_admin  ON public.product_attribute_links;

CREATE POLICY product_attributes_read ON public.product_attributes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY product_attributes_admin ON public.product_attributes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY product_attribute_values_read ON public.product_attribute_values
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY product_attribute_values_admin ON public.product_attribute_values
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY product_attribute_links_read ON public.product_attribute_links
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY product_attribute_links_admin ON public.product_attribute_links
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.product_attributes       TO anon, authenticated;
GRANT SELECT ON public.product_attribute_values TO anon, authenticated;
GRANT SELECT ON public.product_attribute_links  TO anon, authenticated;

COMMENT ON TABLE public.product_attributes IS
  'Merkmale von Artikeln (Farbe, Größe, Material) – gepflegt unter /admin/settings.';
COMMENT ON COLUMN public.product_attribute_values.hex IS
  'Farbwert #RRGGBB für die Darstellung als Farbkreis; leer bei Textmerkmalen.';
