# Kataloggenerator – Umsetzungsplan

> Spec: `docs/superpowers/specs/2026-10-05-kataloggenerator-design.md`
> Ausführung: in einer Sitzung, Aufgabe für Aufgabe, je Aufgabe ein Commit.

**Ziel:** Reiter „Kataloge" in der Verwaltung: Artikel zu einem Katalog
zusammenstellen, speichern und als A4-HTML mit Druckdialog ausgeben.

**Architektur:** `lib/katalog.ts` hält alle Regeln (Preis, Ausschluss,
Faltung, Umbruch) rein und ohne Server. Werkbank (Client) und Bogen (Route
Handler) rufen dieselben Funktionen. Gespeichert werden nur Auswahl und
Einstellungen (Migration 051).

**Stack:** Next.js 16 App Router, Supabase, Zod, kein neues Paket.

## Feste Vorgaben

- Kein neues npm-Paket.
- Maße im Bogen in mm/pt, keine Tailwind-Klassen.
- Keine Verläufe, Schatten, Rundungen, Symbole, Emoji im Bogen.
- Einkaufspreis wird nicht geladen.
- Laden-Preisart ohne Rückfall auf die Staffel.
- Reduzierung nur über `reduzierung()` aus `lib/pricing.ts`.
- Typecheck über `npm run build`.

## Abweichung von der Spec

Der Umbruch rechnet in **Einheiten** statt in ganzen Rasterzeilen: eine Seite
hat 24 Einheiten (Liste 40), eine Kachel 6, eine große Zelle 8, eine
Listenzeile 2, eine Zwischenüberschrift 1 (Liste 2). Eine Zwischenüberschrift
kostete als ganze Rasterzeile bei Kacheln 62 mm weißes Papier.

Ein Ausführungs-Angebot braucht die volle Breite. Steht die laufende
Rasterzeile erst halb voll, wird sie mit den nachfolgenden Einzelartikeln
aufgefüllt und das Angebot danach gesetzt – sonst bliebe mitten auf der Seite
ein Loch.

---

## Aufgabe 1 – Migration und Typen

**Dateien:** `supabase/migrations/051_kataloge.sql`, `lib/types.ts`

- Tabellen `catalogs`, `catalog_items` wie in der Spec, `IF NOT EXISTS`,
  RLS `FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())`,
  GRANTs, Index auf `catalog_items (catalog_id, position)`.

## Aufgabe 2 – Regeln (`lib/katalog.ts`) und Prüfskript

**Dateien:** `lib/katalog.ts`, `scripts/katalog-check.mjs`

Schnittstellen, auf die alles Weitere baut:

```ts
export type KatalogLayout = "liste" | "kacheln" | "gross";
export type KatalogStil = "sachlich" | "prospekt";
export type KatalogPreisart = "grosshandel" | "laden" | "ohne";

export interface KatalogEinstellungen {
  title: string; subtitle: string | null;
  layout: KatalogLayout; stil: KatalogStil; preisart: KatalogPreisart;
  zeigeBarcode: boolean; zeigeBeschreibung: boolean;
  zeigeMerkmale: boolean; zeigeKennzeichen: boolean;
  mitTitelseite: boolean; mitInhalt: boolean;
  mitTrennseiten: boolean; mitRueckseite: boolean;
  rueckseiteText: string | null;
}

export interface KatalogArtikel {
  id: string; sku: string; name: string;
  beschreibung: string | null; barcode: string | null;
  kategorieId: string; kategorie: string; kategorieRang: number;
  gruppeId: string | null; gruppeName: string | null;
  staffeln: { ab: number; preis: number }[];   // aufsteigend, Preis > 0
  laden: number | null; vorher: number | null;
  bestand: number; aktiv: boolean; neu: boolean; topseller: boolean;
  bildUrl: string | null;
  merkmale: { merkmal: string; wert: string }[];
}

export function ausschluss(a: KatalogArtikel, p: KatalogPreisart): "foto" | "preis" | null;
export function katalogPreis(a: KatalogArtikel, p: KatalogPreisart): KatalogPreis | null;
export function listenStaffeln<T>(staffeln: T[]): T[];          // höchstens 3
export function sortiere(artikel: KatalogArtikel[]): KatalogArtikel[]; // Warengruppe, dann Reihenfolge
export function katalogAufbau(artikel: KatalogArtikel[], e: KatalogEinstellungen): KatalogAufbau;
```

`KatalogAufbau`: `seiten` (Artikelseiten mit Blöcken samt Rasterposition),
`inhalt` (Warengruppe → Seitenzahl, `null` wenn entfällt), `gesamtSeiten`,
`gedruckt`, `ohneFoto`, `ohnePreis`.

Prüfskript deckt: Seitenzahl je Raster, Gruppenbeginn auf neuer Seite,
Angebot über volle Breite, Auffüllen der Zeile vor dem Angebot, Teilung eines
überlangen Angebots, Zwischenüberschrift nie als letzte Einheit,
Ausschlüsse je Preisart, kein Staffel-Rückfall bei „laden",
Inhaltsverzeichnis unter acht Seiten.

## Aufgabe 3 – Abfragen und Actions

**Dateien:** `lib/queries/kataloge.ts`, `lib/actions/kataloge.ts`

```ts
getKataloge(): Promise<KatalogZeile[] | null>            // null = Migration fehlt
getKatalog(id): Promise<{ id; einstellungen; productIds: string[] } | null>
getKatalogArtikel(ids?: string[]): Promise<KatalogArtikel[]>

createKatalog(): Promise<never>                          // redirect
duplicateKatalog(id), deleteKatalog(id)
updateKatalogFeld(id, feld, wert)
addKatalogArtikel(id, productIds), removeKatalogArtikel(id, productIds)
setKatalogReihenfolge(id, productIds)                    // neu durchnummeriert
```

Abfragen blättern über 1000 Zeilen hinaus (PostgREST-Grenze).

## Aufgabe 4 – Bogen und Route

**Dateien:** `lib/katalog-bogen.ts`, `app/admin/kataloge/[id]/druck/route.ts`

`buildKatalogHtml(aufbau, einstellungen, firma, { logo, autoPrint, stand })`.
Fotos über den Bildoptimierer in passender Breite – ein Katalog mit
dreihundert Originalfotos wäre als PDF nicht zu verschicken.

## Aufgabe 5 – Liste und Reiter

**Dateien:** `app/admin/kataloge/page.tsx`,
`components/admin/katalog-liste.tsx`, `app/admin/layout.tsx`,
`components/admin/admin-tabs.tsx`

## Aufgabe 6 – Werkbank

**Dateien:** `app/admin/kataloge/[id]/page.tsx`,
`components/admin/katalog-werkbank.tsx`, `katalog-artikel-suche.tsx`,
`katalog-zusammenstellung.tsx`, `katalog-einstellungen.tsx`

## Aufgabe 7 – Abschluss

`npm run build`, Prüfskript, Sichtprüfung im Browser (sechs Kombinationen),
Abschnitt „Kataloge" in CLAUDE.md.
