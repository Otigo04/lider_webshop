# Design: Landingpage-Redesign + Neuheiten-Grundgerüst

Datum: 2026-08-06

## Kontext

Landingpage (`app/page.tsx`) wirkt aktuell zu statisch. Vorbild sind die
**Elemente/Struktur** von idena.de (Screenshot vom Nutzer), ausdrücklich
**nicht** Farben oder die verspielte Spielzeug-Optik – LIDER bleibt nach
CLAUDE.md streng B2B (Charcoal/Blau, keine KI-Ästhetik, keine erfundenen
Inhalte).

Aus idena.de übernommen bzw. bewusst verworfen (Nutzer-Entscheidungen):

| Element bei idena.de | Für LIDER |
|---|---|
| Vorteils-Leiste oben (Versand/Service) | **Verworfen** – zu Endkunden-Shop |
| Lifestyle-Foto-Hero | **Verworfen** – kein passendes Material, keine erfundenen Fotos. Text-Hero bleibt, Struktur wird geschärft |
| "Unsere Highlights" mit NEUHEIT-Badge | **Übernommen**, gespeist aus echten Artikeln über ein neues `is_new`-Flag |
| Produktkarten mit Badge-Ribbon | Übernommen für die Highlights-Sektion (kein Preis – öffentliche Ansicht) |

## 1. DB: `is_new`-Flag (Grundgerüst für Neuheiten/Topseller-Feature)

Migration `009_produkt_flags.sql`:

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_new ON public.products(is_new) WHERE is_new;
```

Bewusst nur `is_new`, kein `is_topseller` – das vollständige
Neuheiten/Topseller-Feature (eigene Nav-Punkte, mehrere Kategorien) ist ein
separates, noch zu planendes Vorhaben. `is_new` ist der gemeinsame
Unterbau, den beide Sessions brauchen (Spalte + Toggle-Muster lassen sich
für `is_topseller` später 1:1 wiederholen).

## 2. Admin: Instant-Toggle in der Artikelliste

`app/admin/products/page.tsx`: neue Spalte "Neuheit" in der Artikeltabelle
mit `Checkbox`, die beim Ändern sofort speichert (kein Save-Button, kein
Bestätigungsdialog – nicht destruktiv). Neue Server Action
`toggleProductFlag` in `lib/actions/admin-products.ts`, neue Client-
Komponente `components/admin/product-flag-toggle.tsx` (Muster: eigener
`useTransition`, `toast` bei Erfolg/Fehler, `router.refresh()` – wie
`ConfirmAction`, nur ohne Dialog).

## 3. Landingpage: Neuheiten-Sektion

Neue Sektion zwischen Hero und "Was Sie im Portal erwartet", nur wenn
mindestens ein Artikel `is_new = true` hat (kein leerer Platzhalter-Zustand
auf der Landingpage). Zeigt bis zu 6 Artikel: Foto, Name, kleines
"Neu"-Badge – **kein Preis** (konsistent mit dem öffentlichen Katalog ohne
Login). Karten verlinken auf `/shop/product/[id]`. Neue Query
`getFeaturedProducts()` in `lib/queries/products.ts` (liest aus
`products_public`, filtert `is_new`, gleiche Bildauflösung wie
`getPublicProducts`).

## 4. Hero: Struktur schärfen

Kein neues Bildmaterial. Anpassungen:
- Klare Primär-/Sekundär-Hierarchie der beiden CTA-Buttons (aktuell
  gleichwertig nebeneinander – "Zum Kundenportal" wird visuell klar
  führend, "Zugang anfragen" bleibt sekundär).
- Warengruppen-Zeile (10/11/12) bekommt etwas mehr Kontrast/Struktur als
  reine Karten-Liste – eigentliches Alleinstellungsmerkmal der Seite ist
  das echte Nummernkreis-System (siehe CLAUDE.md: "keine Dekoration"),
  das bleibt als Signature-Element bestehen statt etwas Neues zu erfinden.

## 5. Bestehende Sektionen

"Was Sie im Portal erwartet", "Über uns", "Zugang anfragen" bleiben
inhaltlich unverändert (Formular ist gerade erst überarbeitet worden) –
nur ggf. Abstände/Übergänge zur neuen Neuheiten-Sektion angepasst, damit
der Rhythmus (dunkel → hell → grau → hell) stimmig bleibt.

## Nicht im Scope

- Suchfeld im Header, Wunschzettel/Konto-Icons wie bei idena – kein
  Bedarf, Katalog hat keine Warenkorb-Funktion für Gäste.
- `is_topseller` und eigene Nav-Punkte "Neuheiten"/"Topseller" – eigenes
  Feature, wird separat geplant.
- Neue Produktfotografie/Hero-Bildmaterial – nicht vorhanden, wird nicht
  erfunden.
