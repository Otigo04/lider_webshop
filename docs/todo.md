# To-do – Ausbaustufe „Farbe, Logo, POS"

Stand: 2026-09-04 · alles umgesetzt, offen ist nur das Einspielen der
Migrationen (siehe ganz unten).

## 1. Logo austauschen
- [x] `lider_final_background.png` beschnitten und in vier Fassungen nach
      `public/logo/` gelegt: `logo.png` (Lockup), `logo-mark.png` (Wappen,
      quadratisch), `logo-print.png` (RGB fürs PDF), `logo-original.png` (Quelle)
- [x] `lib/logo.ts` um Wappen- und Druckvariante erweitert
- [x] Kopfleiste, Menü, Fußzeile, Anmeldeseiten auf das neue Logo umgestellt
- [x] Rechnungs- und Beleg-PDF: Logo im Briefkopf oben rechts
- [x] Impressum: Logo groß über den Pflichtangaben
- [x] Favicon `app/icon.png` aus dem Wappen

## 2. Farbsystem kontrastreicher
- [x] Markenfarben aus dem Logo: Blau `#284078`, Gold `#b8721c`, Rot `#a02020`
- [x] Kontraste angehoben (`muted-foreground` von 4,8:1 auf 7,6:1, kräftigere
      Rahmen, Navy statt Anthrazit auf den dunklen Flächen)
- [x] Kategorie-Akzentpalette auf kräftigere 100/800-Töne
- [x] Kopfleiste: aktiver Reiter mit Fläche und goldenem Balken
      (`components/main-nav.tsx`), goldene Kante unter der Leiste
- [x] Menü auf schmalen Bildschirmen angeglichen

## 3. Adminpanel
- [x] Reiterleiste mit Symbolen, aktivem Zustand und Farbe
      (`components/admin/admin-tabs.tsx`)
- [x] Dashboard: farbige Kennzahlkacheln, Tagesumsatz der Kasse, meistverkaufte
      Artikel, hervorgehobene Warnliste bei knappem Bestand
- [x] Bestand-Badge „nur noch xx verfügbar": `whitespace-nowrap`, kein Umbruch
      hinter der Zahl mehr

## 4. Rechnungsnummern
- [x] Migration 017: neues Format `LI` + sieben Ziffern (`LI0000001`)
- [x] Bereits vergebene Nummern bleiben unverändert (fortlaufende Nummerierung)

## 5. Startseite
- [x] Hero-Schaltfläche „Zum Sortiment", Kundenportal als Textlink daneben
- [x] Nummernkreise (10/11/12) aus der Warengruppenliste entfernt
- [x] Neue Sektion „Das Sortiment" direkt unter dem Kopfbereich: Warengruppen
      links, Artikelraster rechts
- [x] „Was Sie im Portal erwartet" nach unten verschoben
- [x] Neuheiten als eigener, goldgetönter Abschnitt
- [x] Mehr Farbe: getönte Abschnittsflächen, farbige Warengruppenkacheln,
      Gold als Akzent auf den dunklen Flächen

## 6. „NEU" für drei Tage
- [x] `lib/product-flags.ts`: neu = Flag `is_new` **oder** jünger als 3 Tage
- [x] `PublicProductListItem` um `created_at` erweitert
- [x] Badge, Startseite, Filter und `/shop/neuheiten` folgen derselben Regel

## 7. POS-Modul (Kasse)
- [x] Migration 018: `products.barcode`, `pos_sales`, `pos_sale_items`,
      Belegnummern, `create_pos_sale()`, `pos_summary()`, RLS, Storage-Policy
- [x] `/admin/pos` – Kassenoberfläche
  - [x] Kundenwahl vorab: Bestandskunde / Neukunde / ohne Anmeldung
  - [x] Großes Scannerfeld, Enter schließt den Scan ab, Fokuswächter
  - [x] Treffer → auf den Bon; kein Treffer → Anlegedialog mit dem Code
  - [x] Bon: Menge +/−, Preis änderbar, löschen, Netto / USt / Gesamt live
  - [x] Rückfrage vor dem Abschluss
  - [x] Abschluss: Bestand abbuchen, Verkauf speichern, Beleg-PDF
  - [x] Toasts, Ladezustände, Fehlerbehandlung, keine negativen Bestände
  - [x] Layout für Laptop und Tablet
- [x] `/admin/sales` – Verkaufshistorie mit Filter und Beleg-Download
- [x] Barcode im Artikelformular und in der Artikelliste
- [x] Kasse in der Adminleiste

## 8. Adminpanel modular
- [x] Artikelliste mit Inline-Bearbeitung (Bezeichnung, Barcode, Warengruppe,
      Preis, Bestand) – jede Änderung sofort in der Datenbank
- [x] `updateProductField` mit eigenem Zod-Schema je Feld
- [x] Kategorien ebenfalls inline (Reihenfolge, Name, Nummernkreis)
- [x] Verkaufshistorie mit Zeitraum-, Zahlart- und Volltextfilter
- [x] Dashboard mit Tageskennzahlen, Meistverkauft und Bestandswarnung
- [x] Keine festverdrahteten Werte: Steuersatz, Preislesart und Bonfußzeile
      stehen in `company_settings` und werden unter `/admin/settings` gepflegt

## 9. Abschluss
- [x] `npm run build` läuft durch
- [x] `npx eslint .` ohne Befund
- [x] CLAUDE.md um Logo, Kasse, Neu-Regel und Inline-Bearbeitung ergänzt

---

## Noch von Hand zu tun

Im Supabase SQL Editor der Reihe nach ausführen – vorher bleiben Kasse und
Verkaufshistorie leer, und ein Scan findet keinen Artikel:

1. `supabase/migrations/017_rechnungsnummern.sql`
2. `supabase/migrations/018_kasse_pos.sql`

Danach unter `/admin/settings` die Kassenvorgaben prüfen (Steuersatz,
Endpreise ja/nein, Bonfußzeile) und bei den Artikeln die Barcodes nachtragen –
in der Artikelliste geht das direkt in der Tabelle.
