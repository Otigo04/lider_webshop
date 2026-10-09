# Artikelliste: Filter, Sortierung, Rücksprung – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/products` bekommt Warengruppen-/Artikelgruppen-Filter, Preis- und Bestandsbereich, mehr Sortierungen und eine Chip-Leiste; nach dem Bearbeiten führt ein Knopf zurück an dieselbe Stelle der Liste.

**Architecture:** Alle neuen Filter und Sortierungen sind reine Funktionen in `lib/admin-product-filter.ts`, angewandt auf die schon vollständig geladene Liste (die Abfrage `getAdminProducts` bleibt unverändert). Der Filterzustand lebt in der Adresszeile; eine zentrale `baueArtikelQuery()` ersetzt den handgebauten `href()`. Der Rücksprung nutzt `sessionStorage` (Adresse, Scrollhöhe, Artikel-ID) über `lib/artikel-ruecksprung.ts`.

**Tech Stack:** Next.js 16 (Server Component Seite, kleine Client-Komponenten), TypeScript, Node-Testrunner (`npm test`).

## Global Constraints

- Abweichung von der Spec: **keine Filterung in der Abfrage**. Kategorie und Artikelgruppe filtert ebenfalls die Anwendung (die Zählung „vor dem Filter" braucht die volle Menge, die Liste ist ohnehin komplett geladen).
- Abweichung von der Spec: **„Ohne Warengruppe" entfällt** – `products.category_id` ist `NOT NULL`.
- Zahlenfelder der Bereichsfilter sind **unkontrollierte** Eingabefelder im GET-Formular, kein `NumericInput`: leer muss „unbegrenzt" heißen, `NumericInput` meldet leer als 0, und die Seite ist eine Server Component ohne Zahlen-State.
- Einkaufspreis wird nirgends gefiltert, sortiert oder geladen.
- Leeres Preisfeld heißt „unverändert/unbegrenzt", nicht 0.
- Texte deutsch, Palette unverändert, keine neue Dekoration (CLAUDE.md Design-Richtlinie).
- Vor jedem Commit: `npm test`; am Ende zusätzlich `npm run lint` und `npm run build`.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Dateistruktur

| Datei | Aufgabe |
|-------|---------|
| `lib/admin-product-filter.ts` (ändern) | `ArtikelFilter`, Parsen, Query bauen, Filtern, Sortieren, Zählen |
| `tests/artikel-filter.test.ts` (neu) | Tests dazu |
| `lib/artikel-ruecksprung.ts` (neu) | Adressprüfung rein, Storage-Zugriffe gekapselt |
| `tests/artikel-ruecksprung.test.ts` (neu) | Test der Adressprüfung |
| `components/admin/zurueck-zur-liste.tsx` (neu) | Link, der zur gemerkten Liste zurückführt |
| `components/admin/artikel-liste-merker.tsx` (neu) | merkt beim Klick auf Bearbeiten, stellt Scrollposition her |
| `components/forms/product-form.tsx` (ändern) | Knopf „Speichern & zur Liste", Abbrechen |
| `app/admin/products/[id]/edit/page.tsx` (ändern) | „Alle Artikel" nutzt `ZurueckZurListe` |
| `app/admin/products/page.tsx` (ändern) | neue Filter-UI, Chips, Zeilen-IDs, Merker |
| `docs/lager.md` (ändern) | Abschnitt Artikelliste |

---

### Task 1: Filter- und Sortierlogik

**Files:**
- Modify: `lib/admin-product-filter.ts`
- Create: `tests/artikel-filter.test.ts`

**Interfaces:**
- Produces (alles aus `@/lib/admin-product-filter`):
  - `ARTIKEL_SORT`, `type ArtikelSort`, `ARTIKEL_SORT_LABELS: Record<ArtikelSort,string>`
  - `ALLE_AUSFUEHRUNGEN = "alle"`
  - `interface ArtikelFilter { q: string; ohneBild: boolean; inaktiv: boolean; flags: string[]; lager: LagerFilter[]; kat: string[]; gruppe: string[]; preisVon: number|null; preisBis: number|null; bestandVon: number|null; bestandBis: number|null; sort: ArtikelSort }`
  - `STANDARD_FILTER: ArtikelFilter`
  - `leseArtikelFilter(params: Record<string, string | string[] | undefined>): ArtikelFilter`
  - `baueArtikelQuery(filter: ArtikelFilter): string` (ohne führendes `?`, `""` bei Standard)
  - `abfrageSort(sort: ArtikelSort): "name" | "neu" | "alt"`
  - `grundpreis(product): number | null`
  - `filtereArtikel(products, filter): AdminProductRow[]` (kat, gruppe, Preis, Bestand; nicht `lager`)
  - `sortiereArtikel(products, sort): AdminProductRow[]`
  - `zaehleKategorien(products): Map<string, number>`

- [ ] **Step 1: Failing test schreiben**

`tests/artikel-filter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLE_AUSFUEHRUNGEN,
  STANDARD_FILTER,
  abfrageSort,
  baueArtikelQuery,
  filtereArtikel,
  grundpreis,
  leseArtikelFilter,
  sortiereArtikel,
  zaehleKategorien,
} from "@/lib/admin-product-filter";
import type { AdminProductRow } from "@/lib/queries/admin";

function row(o: {
  name: string;
  sku?: string;
  kat?: string;
  gruppe?: string;
  preise?: [number, number][];
  bestand?: number;
  reserviert?: number;
}): AdminProductRow {
  return {
    id: o.name,
    name: o.name,
    sku: o.sku ?? o.name,
    category_id: o.kat ?? "k0",
    category: { id: o.kat ?? "k0", name: o.kat ?? "k0" },
    group_id: o.gruppe ?? null,
    group: o.gruppe ? { id: o.gruppe, name: o.gruppe } : null,
    variants: (o.preise ?? []).map(([min, preis], i) => ({
      id: `v${i}`,
      min_quantity: min,
      max_quantity: null,
      unit_price: preis,
    })),
    stock_available: o.bestand ?? 0,
    stock_reserved: o.reserviert ?? 0,
  } as unknown as AdminProductRow;
}

function alsParams(query: string) {
  const r: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const alt = r[k];
    r[k] = alt === undefined ? v : Array.isArray(alt) ? [...alt, v] : [alt, v];
  }
  return r;
}

const namen = (l: AdminProductRow[]) => l.map((p) => p.name);

test("ohne Parameter gilt der Standard, und der steht nicht in der Adresse", () => {
  assert.deepEqual(leseArtikelFilter({}), STANDARD_FILTER);
  assert.equal(baueArtikelQuery(STANDARD_FILTER), "");
});

test("Unbekanntes wird verworfen: Sortierung, Lagerfilter, Zahlen", () => {
  const f = leseArtikelFilter({
    sort: "quatsch",
    lager: ["knapp", "gibtsnicht"],
    preis_von: "abc",
    bestand_bis: " ",
  });
  assert.equal(f.sort, "name");
  assert.deepEqual(f.lager, ["knapp"]);
  assert.equal(f.preisVon, null);
  assert.equal(f.bestandBis, null);
});

test("Dezimalkomma wird gelesen", () => {
  assert.equal(leseArtikelFilter({ preis_von: "1,5" }).preisVon, 1.5);
});

test("Filter überleben die Rundreise Bauen → Lesen", () => {
  const f = {
    ...STANDARD_FILTER,
    q: "ball rot",
    ohneBild: true,
    flags: ["is_new", "abc"],
    lager: ["knapp" as const],
    kat: ["a", "b"],
    gruppe: [ALLE_AUSFUEHRUNGEN],
    preisVon: 1.5,
    bestandBis: 20,
    sort: "kategorie" as const,
  };
  assert.deepEqual(leseArtikelFilter(alsParams(baueArtikelQuery(f))), f);
});

test("abfrageSort: nur Datum geht in die Abfrage, alles andere bleibt Name", () => {
  assert.equal(abfrageSort("neu"), "neu");
  assert.equal(abfrageSort("alt"), "alt");
  assert.equal(abfrageSort("kategorie"), "name");
  assert.equal(abfrageSort("preis-auf"), "name");
});

test("Grundpreis ist der Preis der Staffel mit der kleinsten Mindestmenge", () => {
  assert.equal(grundpreis(row({ name: "x", preise: [[50, 1], [10, 2]] })), 2);
  assert.equal(grundpreis(row({ name: "x" })), null);
});

test("Kategorie- und Artikelgruppenfilter: ODER innerhalb, UND untereinander", () => {
  const liste = [
    row({ name: "a", kat: "k1", gruppe: "g1" }),
    row({ name: "b", kat: "k2" }),
    row({ name: "c", kat: "k1" }),
  ];
  assert.deepEqual(
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, kat: ["k1", "k2"] })),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, kat: ["k1"], gruppe: ["g1"] })),
    ["a"],
  );
  assert.deepEqual(
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, gruppe: [ALLE_AUSFUEHRUNGEN] })),
    ["a"],
  );
});

test("Preisbereich: Grenzen zählen mit, ohne Staffel fällt heraus, von > bis ist leer", () => {
  const liste = [
    row({ name: "billig", preise: [[1, 0.5]] }),
    row({ name: "mittel", preise: [[1, 1.5]] }),
    row({ name: "teuer", preise: [[1, 3]] }),
    row({ name: "ohne" }),
  ];
  const mit = (preisVon: number | null, preisBis: number | null) =>
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, preisVon, preisBis }));
  assert.deepEqual(mit(0.5, 1.5), ["billig", "mittel"]);
  assert.deepEqual(mit(2, null), ["teuer"]);
  assert.deepEqual(mit(null, 1), ["billig"]);
  assert.deepEqual(mit(3, 1), []);
  assert.deepEqual(mit(null, null), ["billig", "mittel", "teuer", "ohne"]);
});

test("Bestandsbereich rechnet mit dem freien Bestand", () => {
  const liste = [
    row({ name: "a", bestand: 10, reserviert: 4 }),
    row({ name: "b", bestand: 5 }),
    row({ name: "c", bestand: 0 }),
  ];
  const mit = (bestandVon: number | null, bestandBis: number | null) =>
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, bestandVon, bestandBis }));
  assert.deepEqual(mit(6, null), ["a"]);
  assert.deepEqual(mit(null, 5), ["b", "c"]);
  assert.deepEqual(mit(0, 0), ["c"]);
});

test("Sortierung nach Warengruppe: Gruppe, dann Name", () => {
  const liste = [
    row({ name: "Zange", kat: "Werkzeug" }),
    row({ name: "Ball", kat: "Spielzeug" }),
    row({ name: "Auto", kat: "Spielzeug" }),
  ];
  assert.deepEqual(namen(sortiereArtikel(liste, "kategorie")), ["Auto", "Ball", "Zange"]);
});

test("Sortierung nach Preis: ohne Preis immer am Ende", () => {
  const liste = [
    row({ name: "ohne" }),
    row({ name: "teuer", preise: [[1, 3]] }),
    row({ name: "billig", preise: [[1, 1]] }),
  ];
  assert.deepEqual(namen(sortiereArtikel(liste, "preis-auf")), ["billig", "teuer", "ohne"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "preis-ab")), ["teuer", "billig", "ohne"]);
});

test("Sortierung nach Bestand, Artikelnummer und Name Z–A", () => {
  const liste = [
    row({ name: "a", sku: "300", bestand: 10, reserviert: 8 }),
    row({ name: "b", sku: "20", bestand: 5 }),
  ];
  assert.deepEqual(namen(sortiereArtikel(liste, "bestand-auf")), ["a", "b"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "bestand-ab")), ["b", "a"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "sku")), ["b", "a"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "name-z")), ["b", "a"]);
});

test("Datumssortierung und Name lässt die Reihenfolge der Abfrage stehen", () => {
  const liste = [row({ name: "b" }), row({ name: "a" })];
  assert.deepEqual(namen(sortiereArtikel(liste, "neu")), ["b", "a"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "name")), ["b", "a"]);
});

test("Warengruppen werden gezählt", () => {
  const z = zaehleKategorien([
    row({ name: "a", kat: "k1" }),
    row({ name: "b", kat: "k1" }),
    row({ name: "c", kat: "k2" }),
  ]);
  assert.equal(z.get("k1"), 2);
  assert.equal(z.get("k2"), 1);
});
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

Run: `npm test 2>&1 | tail -30`
Expected: FAIL (`STANDARD_FILTER`/… nicht exportiert).

- [ ] **Step 3: Implementieren**

In `lib/admin-product-filter.ts` den Import oben ersetzen durch:

```ts
import type { AdminProductRow } from "@/lib/queries/admin";
import { freeStock, lowestUnitPrice, reduzierung, stockLevel } from "@/lib/pricing";
```
(unverändert) und am Dateiende anhängen:

```ts
/* ------------------------------------------------------------------ */
/* Gesamter Filterzustand der Artikelliste                              */
/* ------------------------------------------------------------------ */

export const ARTIKEL_SORT = [
  "name",
  "name-z",
  "kategorie",
  "sku",
  "preis-auf",
  "preis-ab",
  "bestand-auf",
  "bestand-ab",
  "neu",
  "alt",
] as const;

export type ArtikelSort = (typeof ARTIKEL_SORT)[number];

export const ARTIKEL_SORT_LABELS: Record<ArtikelSort, string> = {
  name: "Name A–Z",
  "name-z": "Name Z–A",
  kategorie: "Warengruppe",
  sku: "Artikelnummer",
  "preis-auf": "Preis aufsteigend",
  "preis-ab": "Preis absteigend",
  "bestand-auf": "Bestand aufsteigend",
  "bestand-ab": "Bestand absteigend",
  neu: "Neueste zuerst",
  alt: "Älteste zuerst",
};

/** Sonderwert bei `gruppe`: alle Artikel, die Ausführung eines Angebots sind. */
export const ALLE_AUSFUEHRUNGEN = "alle";

export interface ArtikelFilter {
  q: string;
  ohneBild: boolean;
  inaktiv: boolean;
  /** feste Flags („is_new", „is_topseller") und UUIDs freier Flags */
  flags: string[];
  lager: LagerFilter[];
  /** Warengruppen (Kategorie-UUIDs), ODER */
  kat: string[];
  /** Artikelgruppen-UUIDs oder ALLE_AUSFUEHRUNGEN, ODER */
  gruppe: string[];
  /** Großhandelspreis der Grundstaffel; null = unbegrenzt */
  preisVon: number | null;
  preisBis: number | null;
  /** freier Bestand; null = unbegrenzt */
  bestandVon: number | null;
  bestandBis: number | null;
  sort: ArtikelSort;
}

export const STANDARD_FILTER: ArtikelFilter = {
  q: "",
  ohneBild: false,
  inaktiv: false,
  flags: [],
  lager: [],
  kat: [],
  gruppe: [],
  preisVon: null,
  preisBis: null,
  bestandVon: null,
  bestandBis: null,
  sort: "name",
};

type Params = Record<string, string | string[] | undefined>;

function liste(wert: string | string[] | undefined): string[] {
  return (Array.isArray(wert) ? wert : wert ? [wert] : []).filter(
    (eintrag): eintrag is string => typeof eintrag === "string" && eintrag !== "",
  );
}

function zahl(wert: string | string[] | undefined): number | null {
  if (typeof wert !== "string") return null;
  const text = wert.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function istArtikelSort(wert: unknown): wert is ArtikelSort {
  return (
    typeof wert === "string" && (ARTIKEL_SORT as readonly string[]).includes(wert)
  );
}

export function leseArtikelFilter(params: Params): ArtikelFilter {
  return {
    q: typeof params.q === "string" ? params.q : "",
    ohneBild: params.bild === "ohne",
    inaktiv: params.status === "inaktiv",
    flags: liste(params.flag),
    lager: liste(params.lager).filter(istLagerFilter),
    kat: liste(params.kat),
    gruppe: liste(params.gruppe),
    preisVon: zahl(params.preis_von),
    preisBis: zahl(params.preis_bis),
    bestandVon: zahl(params.bestand_von),
    bestandBis: zahl(params.bestand_bis),
    sort: istArtikelSort(params.sort) ? params.sort : "name",
  };
}

/**
 * Adresszeile (ohne „?") für einen Filterzustand. Was dem Standard entspricht,
 * wird weggelassen – so bleibt die Adresse kurz und „kein Filter" ist leer.
 */
export function baueArtikelQuery(filter: ArtikelFilter): string {
  const suche = new URLSearchParams();
  if (filter.q) suche.set("q", filter.q);
  if (filter.ohneBild) suche.set("bild", "ohne");
  if (filter.inaktiv) suche.set("status", "inaktiv");
  for (const flag of filter.flags) suche.append("flag", flag);
  for (const eintrag of filter.lager) suche.append("lager", eintrag);
  for (const kat of filter.kat) suche.append("kat", kat);
  for (const gruppe of filter.gruppe) suche.append("gruppe", gruppe);
  if (filter.preisVon !== null) suche.set("preis_von", String(filter.preisVon));
  if (filter.preisBis !== null) suche.set("preis_bis", String(filter.preisBis));
  if (filter.bestandVon !== null) suche.set("bestand_von", String(filter.bestandVon));
  if (filter.bestandBis !== null) suche.set("bestand_bis", String(filter.bestandBis));
  if (filter.sort !== "name") suche.set("sort", filter.sort);
  return suche.toString();
}

/** Die Abfrage kennt nur Name und Datum; alles andere sortiert die Anwendung. */
export function abfrageSort(sort: ArtikelSort): "name" | "neu" | "alt" {
  return sort === "neu" || sort === "alt" ? sort : "name";
}

/**
 * Preis der Grundstaffel (kleinste Mindestmenge) – derselbe, den die GH-Zelle
 * der Tabelle zeigt und beim Tippen überschreibt.
 */
export function grundpreis(product: AdminProductRow): number | null {
  const grund = [...(product.variants ?? [])].sort(
    (x, y) => x.min_quantity - y.min_quantity,
  )[0];
  return grund ? Number(grund.unit_price) : null;
}

function imBereich(
  wert: number | null,
  von: number | null,
  bis: number | null,
): boolean {
  if (von === null && bis === null) return true;
  if (von !== null && bis !== null && von > bis) return false;
  if (wert === null) return false;
  if (von !== null && wert < von) return false;
  if (bis !== null && wert > bis) return false;
  return true;
}

/**
 * Warengruppe, Artikelgruppe, Preis- und Bestandsbereich. Die Lagerkacheln
 * bleiben bei `filtereNachLager`; getrennt, damit deren Zahlen auf der hier
 * schon gefilterten Menge gezählt werden können.
 */
export function filtereArtikel(
  products: AdminProductRow[],
  filter: ArtikelFilter,
): AdminProductRow[] {
  return products.filter((product) => {
    if (filter.kat.length > 0 && !filter.kat.includes(product.category_id)) {
      return false;
    }
    if (filter.gruppe.length > 0) {
      const gruppeId = product.group_id;
      const trifft = filter.gruppe.some((g) =>
        g === ALLE_AUSFUEHRUNGEN ? gruppeId !== null : g === gruppeId,
      );
      if (!trifft) return false;
    }
    if (!imBereich(grundpreis(product), filter.preisVon, filter.preisBis)) {
      return false;
    }
    return imBereich(freeStock(product), filter.bestandVon, filter.bestandBis);
  });
}

const COLLATOR = new Intl.Collator("de", { sensitivity: "base", numeric: true });

function nachName(a: AdminProductRow, b: AdminProductRow): number {
  return COLLATOR.compare(a.name, b.name);
}

/** Leere Werte stehen immer hinten, egal in welche Richtung sortiert wird. */
function zahlen(a: number | null, b: number | null, aufsteigend: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return aufsteigend ? a - b : b - a;
}

/**
 * Reihenfolge der Liste. „name", „neu" und „alt" kommen schon sortiert aus
 * der Abfrage und bleiben, wie sie sind.
 */
export function sortiereArtikel(
  products: AdminProductRow[],
  sort: ArtikelSort,
): AdminProductRow[] {
  const kopie = [...products];
  switch (sort) {
    case "name-z":
      return kopie.sort((a, b) => nachName(b, a));
    case "kategorie":
      return kopie.sort(
        (a, b) =>
          COLLATOR.compare(a.category?.name ?? "", b.category?.name ?? "") ||
          nachName(a, b),
      );
    case "sku":
      return kopie.sort((a, b) => COLLATOR.compare(a.sku, b.sku));
    case "preis-auf":
    case "preis-ab":
      return kopie.sort(
        (a, b) =>
          zahlen(grundpreis(a), grundpreis(b), sort === "preis-auf") ||
          nachName(a, b),
      );
    case "bestand-auf":
    case "bestand-ab":
      return kopie.sort(
        (a, b) =>
          zahlen(freeStock(a), freeStock(b), sort === "bestand-auf") ||
          nachName(a, b),
      );
    default:
      return products;
  }
}

/** Artikel je Warengruppe, für die Zahl im Auswahlmenü. */
export function zaehleKategorien(products: AdminProductRow[]): Map<string, number> {
  const zaehler = new Map<string, number>();
  for (const product of products) {
    zaehler.set(product.category_id, (zaehler.get(product.category_id) ?? 0) + 1);
  }
  return zaehler;
}
```

Wichtig: `row()` im Test setzt immer eine Kategorie; deshalb braucht `sortiereArtikel("kategorie")` keinen Sonderfall für „ohne Warengruppe".

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test 2>&1 | tail -30`
Expected: alle PASS (bestehende Tests unverändert grün).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-product-filter.ts tests/artikel-filter.test.ts
git commit -m "feat(artikel): Filter und Sortierung der Artikelliste als reine Funktionen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rücksprung-Logik, Merker und Rücksprung-Link

**Files:**
- Create: `lib/artikel-ruecksprung.ts`, `tests/artikel-ruecksprung.test.ts`
- Create: `components/admin/zurueck-zur-liste.tsx`, `components/admin/artikel-liste-merker.tsx`

**Interfaces:**
- Produces:
  - `sichereListenAdresse(adresse: unknown): string` – rein
  - `interface ListenMerk { adresse: string; hoehe: number; id: string | null }`
  - `merkeListe(merk: ListenMerk): void`, `holeListe(): ListenMerk | null`
  - `listenZiel(): string`
  - `merkeWiederherstellen(): void`, `nimmWiederherstellen(): boolean`
  - `<ZurueckZurListe {...LinkProps}>`, `<ArtikelListeMerker />`

- [ ] **Step 1: Failing test**

`tests/artikel-ruecksprung.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sichereListenAdresse } from "@/lib/artikel-ruecksprung";

test("Die Liste samt Suche ist ein gültiges Ziel", () => {
  assert.equal(sichereListenAdresse("/admin/products"), "/admin/products");
  assert.equal(
    sichereListenAdresse("/admin/products?q=ball&sort=kategorie"),
    "/admin/products?q=ball&sort=kategorie",
  );
});

test("Alles andere fällt auf die Liste zurück", () => {
  for (const fremd of [
    "https://boese.example/admin/products",
    "//boese.example",
    "/admin/products/123/edit",
    "/admin/productsx",
    "/kasse",
    "",
    null,
    42,
  ]) {
    assert.equal(sichereListenAdresse(fremd), "/admin/products");
  }
});
```

- [ ] **Step 2:** `npm test 2>&1 | tail -15` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

`lib/artikel-ruecksprung.ts`:

```ts
/**
 * Rücksprung aus dem Artikel in die Artikelliste.
 *
 * Wer Artikel nacheinander abarbeitet, soll nach dem Speichern dort
 * weitermachen, wo er war: gleiche Suche, gleiche Filter, gleiche Stelle.
 * Gemerkt wird in sessionStorage (pro Tab, kein Datenbankzugriff). Jeder
 * Zugriff steht in try/catch: ohne Storage (privates Fenster, gesperrt)
 * läuft alles wie vorher, man landet dann auf der frischen Liste.
 */

const LISTE = "/admin/products";
const SCHLUESSEL = "artikelliste:merk";
const FLAG = "artikelliste:wiederherstellen";

export interface ListenMerk {
  adresse: string;
  hoehe: number;
  id: string | null;
}

/**
 * Nur die Liste selbst (mit beliebiger Suche) ist ein erlaubtes Ziel. Der
 * Wert kommt aus dem Storage, also von außen veränderbar – ein Link auf eine
 * fremde Adresse wäre eine offene Weiterleitung.
 */
export function sichereListenAdresse(adresse: unknown): string {
  if (typeof adresse !== "string") return LISTE;
  if (adresse === LISTE) return adresse;
  return adresse.startsWith(`${LISTE}?`) ? adresse : LISTE;
}

export function merkeListe(merk: ListenMerk): void {
  try {
    sessionStorage.setItem(SCHLUESSEL, JSON.stringify(merk));
  } catch {
    /* ohne Storage bleibt es beim Verhalten von vorher */
  }
}

export function holeListe(): ListenMerk | null {
  try {
    const roh = sessionStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const wert = JSON.parse(roh) as Partial<ListenMerk>;
    return {
      adresse: sichereListenAdresse(wert.adresse),
      hoehe: typeof wert.hoehe === "number" ? wert.hoehe : 0,
      id: typeof wert.id === "string" ? wert.id : null,
    };
  } catch {
    return null;
  }
}

/** Wohin „zurück zur Liste" führt: die gemerkte Adresse oder die frische Liste. */
export function listenZiel(): string {
  return holeListe()?.adresse ?? LISTE;
}

/** Die nächste Liste soll die gemerkte Stelle ansteuern (einmalig). */
export function merkeWiederherstellen(): void {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* s. o. */
  }
}

/** Liest und löscht das Flag. true = diesmal wiederherstellen. */
export function nimmWiederherstellen(): boolean {
  try {
    const gesetzt = sessionStorage.getItem(FLAG) === "1";
    sessionStorage.removeItem(FLAG);
    return gesetzt;
  } catch {
    return false;
  }
}
```

`components/admin/zurueck-zur-liste.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { listenZiel, merkeWiederherstellen } from "@/lib/artikel-ruecksprung";

/**
 * Link zurück zur Artikelliste – an die Stelle, von der man kam. Der href
 * bleibt die frische Liste: Mittelklick und „In neuem Tab öffnen" tun, was
 * man von einem Link erwartet. Nur der normale Klick springt zur gemerkten
 * Suche.
 */
export function ZurueckZurListe({
  onClick,
  ...rest
}: Omit<React.ComponentProps<typeof Link>, "href">) {
  const router = useRouter();

  return (
    <Link
      {...rest}
      href="/admin/products"
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        merkeWiederherstellen();
        router.push(listenZiel());
      }}
    />
  );
}
```

`components/admin/artikel-liste-merker.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import {
  holeListe,
  merkeListe,
  nimmWiederherstellen,
} from "@/lib/artikel-ruecksprung";

const ZEILE = "artikel-";

/**
 * Sitzt unsichtbar in der Artikelliste und tut zwei Dinge:
 *
 * 1. Klickt man auf „Bearbeiten", merkt sie sich Adresse (mit Suche und
 *    Filtern), Scrollhöhe und Artikel. Per Klick-Abfang am Dokument, damit
 *    die Liste selbst eine Server Component bleibt.
 * 2. Kommt man mit gesetztem Rücksprung-Flag zurück, scrollt sie zur Zeile
 *    des zuletzt bearbeiteten Artikels – fehlt die (Filter geändert), auf die
 *    gespeicherte Höhe.
 */
export function ArtikelListeMerker() {
  useEffect(() => {
    if (nimmWiederherstellen()) {
      const merk = holeListe();
      if (merk) {
        // Nach dem Rendern: Next setzt beim Seitenwechsel selbst nach oben.
        requestAnimationFrame(() => {
          const zeile = merk.id
            ? document.getElementById(`${ZEILE}${merk.id}`)
            : null;
          if (zeile) zeile.scrollIntoView({ block: "center" });
          else window.scrollTo(0, merk.hoehe);
        });
      }
    }

    function beimKlick(event: MouseEvent) {
      const ziel = event.target;
      if (!(ziel instanceof Element)) return;
      const link = ziel.closest('a[href^="/admin/products/"][href$="/edit"]');
      if (!link) return;
      const zeile = link.closest("tr");
      merkeListe({
        adresse: window.location.pathname + window.location.search,
        hoehe: window.scrollY,
        id: zeile?.id.startsWith(ZEILE) ? zeile.id.slice(ZEILE.length) : null,
      });
    }

    document.addEventListener("click", beimKlick);
    return () => document.removeEventListener("click", beimKlick);
  }, []);

  return null;
}
```

- [ ] **Step 4:** `npm test 2>&1 | tail -15` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/artikel-ruecksprung.ts tests/artikel-ruecksprung.test.ts components/admin/zurueck-zur-liste.tsx components/admin/artikel-liste-merker.tsx
git commit -m "feat(artikel): Rücksprung zur gemerkten Artikelliste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rücksprung im Artikelformular und auf der Bearbeitungsseite

**Files:**
- Modify: `components/forms/product-form.tsx` (Imports ~Zeile 1–30, `SubmitButton` ~80, Effekt ~173, Knopfzeile ~709)
- Modify: `app/admin/products/[id]/edit/page.tsx` (Link „Alle Artikel")

**Interfaces:**
- Consumes: `ZurueckZurListe`, `listenZiel`, `merkeWiederherstellen`.

- [ ] **Step 1: Formular ändern**

Imports ergänzen (`Link` bleibt, falls anderswo genutzt – sonst entfernen, ESLint zeigt es):

```tsx
import { ZurueckZurListe } from "@/components/admin/zurueck-zur-liste";
import { listenZiel, merkeWiederherstellen } from "@/lib/artikel-ruecksprung";
```

Zweiter Knopf neben `SubmitButton` (nach der Funktion `SubmitButton`):

```tsx
function ListeButton({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      variant="secondary"
      disabled={pending}
      onClick={onClick}
    >
      Speichern &amp; zur Liste
    </Button>
  );
}
```

Im Formular nach `const fileInput = useRef…`:

```tsx
  // Gesetzt, wenn der Speichern-Knopf „& zur Liste" war; der Effekt unten
  // wertet es nach dem Speichern aus. Ein Ref statt State: kein Neurendern nötig.
  const zurListe = useRef(false);
```

Effekt ersetzen (Abhängigkeit jetzt `state`, nicht `state.success`: zweimal speichern liefert denselben Text, aber ein neues Objekt – sonst feuerte der Effekt beim zweiten Mal nicht):

```tsx
  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    if (isNew) {
      router.push(`/admin/products/${productId}/edit`);
    } else if (zurListe.current) {
      zurListe.current = false;
      merkeWiederherstellen();
      router.push(listenZiel());
    } else {
      router.refresh();
    }
  }, [state, isNew, productId, router]);
```

Bei Fehler muss das Flag fallen, sonst springt der nächste normale Speichern-Klick zurück: im selben Effekt vor dem `if (!state.success) return;` einfügen

```tsx
    if (state.error) zurListe.current = false;
```

Knopfzeile am Ende:

```tsx
      <div className="flex flex-wrap gap-3">
        <SubmitButton />
        {isNew ? null : (
          <ListeButton onClick={() => (zurListe.current = true)} />
        )}
        <Button asChild variant="ghost">
          <ZurueckZurListe>Abbrechen</ZurueckZurListe>
        </Button>
      </div>
```

Hinweis: Der normale Speichern-Knopf setzt das Flag nicht; er muss es auf `false` stellen, falls ein früherer „zur Liste"-Versuch ohne Ergebnis blieb. Dafür `SubmitButton` einen `onClick` geben:

```tsx
function SubmitButton({ onClick }: { onClick?: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} onClick={onClick}>
      {pending ? "Wird gespeichert …" : "Artikel speichern"}
    </Button>
  );
}
```
und `<SubmitButton onClick={() => (zurListe.current = false)} />`.

- [ ] **Step 2: Bearbeitungsseite**

In `app/admin/products/[id]/edit/page.tsx` `Link` durch `ZurueckZurListe` ersetzen (Import `Link` entfällt):

```tsx
import { ZurueckZurListe } from "@/components/admin/zurueck-zur-liste";
…
      <ZurueckZurListe className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        Alle Artikel
      </ZurueckZurListe>
```

- [ ] **Step 3: Prüfen**

Run: `npx eslint components/forms/product-form.tsx "app/admin/products/[id]/edit/page.tsx" components/admin/zurueck-zur-liste.tsx components/admin/artikel-liste-merker.tsx`
Expected: keine Fehler (ungenutzte Imports beheben).

- [ ] **Step 4: Commit**

```bash
git add components/forms/product-form.tsx "app/admin/products/[id]/edit/page.tsx"
git commit -m "feat(artikel): Speichern & zur Liste, Abbrechen und Zurück an die gemerkte Stelle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Artikelliste – neue Filter, Chips, Zeilen-IDs

**Files:**
- Modify: `app/admin/products/page.tsx`

**Interfaces:**
- Consumes: alles aus Task 1, `ArtikelListeMerker`, `getProductGroups`/`getGroupOptions` (`{id,name}[]`) aus `@/lib/queries/groups`.

- [ ] **Step 1: Imports** – `ADMIN_PRODUCT_SORT*`/`istAdminProductSort`-Import entfernen (nur `getAdminProducts` bleibt), und

```tsx
import { ArtikelListeMerker } from "@/components/admin/artikel-liste-merker";
import { getGroupOptions } from "@/lib/queries/groups";
import {
  ALLE_AUSFUEHRUNGEN,
  ARTIKEL_SORT,
  ARTIKEL_SORT_LABELS,
  STANDARD_FILTER,
  abfrageSort,
  baueArtikelQuery,
  filtereArtikel,
  grundpreis,
  leseArtikelFilter,
  sortiereArtikel,
  zaehleKategorien,
  type ArtikelFilter,
} from "@/lib/admin-product-filter";
```
(`LAGER_FILTER*`, `filtereNachLager`, `zaehleLager`, `type LagerFilter` bleiben im bestehenden Import; `istLagerFilter` entfällt.)

- [ ] **Step 2: Datenteil** – alles von `const params = await searchParams;` bis einschließlich `function lagerHref(...) {…}` ersetzen durch:

```tsx
  const params = await searchParams;
  const filter = leseArtikelFilter(params);
  const { q: search, ohneBild, inaktiv, lager: lagerFilter, sort } = filter;

  const [alle, categories, customFlags, gruppen] = await Promise.all([
    getAdminProducts({
      search,
      ohneBild,
      inaktiv,
      flagIds: filter.flags,
      sort: abfrageSort(sort),
    }),
    getCategories(),
    getProductFlags(),
    getGroupOptions(),
  ]);

  // Die Zahl an der Warengruppe zählt vor dem Warengruppenfilter, sonst zeigte
  // jede abgewählte Gruppe eine 0. Die Lagerkacheln zählen dagegen nach den
  // übrigen Filtern: „12 ausverkauft" soll in der gewählten Warengruppe die
  // Zahl dieser Warengruppe sein.
  const kategorieZahlen = zaehleKategorien(
    filtereArtikel(alle, { ...filter, kat: [] }),
  );
  const vorLager = filtereArtikel(alle, filter);
  const zaehler = zaehleLager(vorLager);
  const products = sortiereArtikel(filtereNachLager(vorLager, lagerFilter), sort);

  const kategorieOptionen = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  /** Adresse für einen geänderten Filterzustand; alles andere bleibt stehen. */
  function hrefMit(aenderung: Partial<ArtikelFilter>): string {
    const query = baueArtikelQuery({ ...filter, ...aenderung });
    return query ? `/admin/products?${query}` : "/admin/products";
  }

  function lagerHref(eintrag: LagerFilter): string {
    return hrefMit({
      lager: lagerFilter.includes(eintrag)
        ? lagerFilter.filter((gesetzt) => gesetzt !== eintrag)
        : [...lagerFilter, eintrag],
    });
  }

  const flagNamen = new Map<string, string>([
    ["is_new", "Neuheit"],
    ["is_topseller", "Topseller"],
    ...customFlags.map((flag) => [flag.id, flag.name] as [string, string]),
  ]);
  const kategorieNamen = new Map(categories.map((c) => [c.id, c.name]));
  const gruppenNamen = new Map(gruppen.map((g) => [g.id, g.name]));

  const bereich = (von: number | null, bis: number | null, einheit: string) =>
    von !== null && bis !== null
      ? `${von}–${bis}${einheit}`
      : von !== null
        ? `ab ${von}${einheit}`
        : `bis ${bis}${einheit}`;

  /** Ein Chip je gesetztem Filter; Klick auf das × nimmt genau diesen heraus. */
  const chips: { label: string; href: string }[] = [
    ...(search ? [{ label: `Suche: ${search}`, href: hrefMit({ q: "" }) }] : []),
    ...(ohneBild ? [{ label: "Ohne Bild", href: hrefMit({ ohneBild: false }) }] : []),
    ...(inaktiv ? [{ label: "Ausgeblendet", href: hrefMit({ inaktiv: false }) }] : []),
    ...filter.flags.map((id) => ({
      label: `Flag: ${flagNamen.get(id) ?? "?"}`,
      href: hrefMit({ flags: filter.flags.filter((f) => f !== id) }),
    })),
    ...filter.kat.map((id) => ({
      label: kategorieNamen.get(id) ?? "Warengruppe",
      href: hrefMit({ kat: filter.kat.filter((k) => k !== id) }),
    })),
    ...filter.gruppe.map((id) => ({
      label:
        id === ALLE_AUSFUEHRUNGEN
          ? "Nur Ausführungen"
          : `Gruppe: ${gruppenNamen.get(id) ?? "?"}`,
      href: hrefMit({ gruppe: filter.gruppe.filter((g) => g !== id) }),
    })),
    ...(filter.preisVon !== null || filter.preisBis !== null
      ? [
          {
            label: `GH-Preis ${bereich(filter.preisVon, filter.preisBis, " €")}`,
            href: hrefMit({ preisVon: null, preisBis: null }),
          },
        ]
      : []),
    ...(filter.bestandVon !== null || filter.bestandBis !== null
      ? [
          {
            label: `Bestand ${bereich(filter.bestandVon, filter.bestandBis, "")}`,
            href: hrefMit({ bestandVon: null, bestandBis: null }),
          },
        ]
      : []),
  ];
  const irgendeinFilter = chips.length > 0 || lagerFilter.length > 0;
  const alleZurueck = hrefMit({ ...STANDARD_FILTER, sort });
```

Die Konstanten `FESTE_FLAGS` und `ohneBarcode` darunter bleiben. Im Kopf (`<p>` mit „von …"): Bedingung `lagerFilter.length > 0` durch `irgendeinFilter` ersetzen.

- [ ] **Step 3: Formular** – im `<form>`:

a) Hidden-Felder für `lager` bleiben. Nach dem Flags-`<details>` (vor dem Sortierfeld) einfügen:

```tsx
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Warengruppe{filter.kat.length > 0 ? ` (${filter.kat.length})` : ""}
              </summary>
              <div className="absolute z-10 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-md">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="kat"
                      value={category.id}
                      defaultChecked={filter.kat.includes(category.id)}
                      className="size-4 rounded border-input"
                    />
                    <span className="flex-1">{category.name}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {formatQuantity(kategorieZahlen.get(category.id) ?? 0)}
                    </span>
                  </label>
                ))}
              </div>
            </details>

            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Artikelgruppe{filter.gruppe.length > 0 ? ` (${filter.gruppe.length})` : ""}
              </summary>
              <div className="absolute z-10 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-md">
                <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    name="gruppe"
                    value={ALLE_AUSFUEHRUNGEN}
                    defaultChecked={filter.gruppe.includes(ALLE_AUSFUEHRUNGEN)}
                    className="size-4 rounded border-input"
                  />
                  Alle Ausführungen
                </label>
                {gruppen.length > 0 ? (
                  <div className="my-1.5 border-t border-border" />
                ) : null}
                {gruppen.map((gruppe) => (
                  <label
                    key={gruppe.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="gruppe"
                      value={gruppe.id}
                      defaultChecked={filter.gruppe.includes(gruppe.id)}
                      className="size-4 rounded border-input"
                    />
                    {gruppe.name}
                  </label>
                ))}
              </div>
            </details>

            <details className="relative" open={
              filter.preisVon !== null ||
              filter.preisBis !== null ||
              filter.bestandVon !== null ||
              filter.bestandBis !== null
            }>
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Preis &amp; Bestand
              </summary>
              <div className="absolute z-10 mt-1 w-64 space-y-2 rounded-md border border-border bg-popover p-3 shadow-md">
                {(
                  [
                    ["GH-Preis (€)", "preis", filter.preisVon, filter.preisBis],
                    ["Freier Bestand", "bestand", filter.bestandVon, filter.bestandBis],
                  ] as const
                ).map(([titel, name, von, bis]) => (
                  <div key={name}>
                    <p className="mb-1 text-xs text-muted-foreground">{titel}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        name={`${name}_von`}
                        inputMode="decimal"
                        defaultValue={von ?? ""}
                        placeholder="von"
                        aria-label={`${titel} von`}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        name={`${name}_bis`}
                        inputMode="decimal"
                        defaultValue={bis ?? ""}
                        placeholder="bis"
                        aria-label={`${titel} bis`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>
```

Bei `open={…}` auf `<details>` ist React kontrolliert-ähnlich; funktioniert als Anfangszustand, der Server rendert die Seite nach jedem Filtern neu. Wirft ESLint/React hier eine Warnung, `open` weglassen – dann bleibt das Menü zu und die Chips zeigen die Werte.

b) `<select name="sort">`: `ADMIN_PRODUCT_SORT` → `ARTIKEL_SORT`, `ADMIN_PRODUCT_SORT_LABELS` → `ARTIKEL_SORT_LABELS`.

- [ ] **Step 4: Chip-Leiste und Rücksetzen** – im Schnellfilter-`<nav>` den Block `{lagerFilter.length > 0 ? (<Link href={href([])}…>Filter zurücksetzen</Link>) : null}` entfernen und direkt nach dem `</nav>` einfügen:

```tsx
      {irgendeinFilter ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Aktive Filter">
          {chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              title="Filter entfernen"
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs hover:border-brand/40"
            >
              {chip.label}
              <span aria-hidden>×</span>
              <span className="sr-only">entfernen</span>
            </Link>
          ))}
          <Link
            href={alleZurueck}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Alle zurücksetzen
          </Link>
        </div>
      ) : null}
```

- [ ] **Step 5: Leertext, Zeilen-IDs, Grundpreis, Merker**
  - Leertext: Bedingung `search || ohneBild || inaktiv || flagIds.length > 0` → `irgendeinFilter`.
  - `<tr key={product.id}` bekommt `id={`artikel-${product.id}`}`. Zusätzlich `scroll-mt-24` in der className (Kopfleiste soll die Zeile nicht verdecken).
  - Die Zeilen `const grund = [...] … const grundpreis = grund ? … : null;` ersetzen durch `const grundpreisWert = grundpreis(product);` und die Verwendung von `grundpreis` weiter unten in der Zeile (GH-Zelle) auf `grundpreisWert` umstellen. `grundpreis` aus dem Import dient der Funktion; keine Namenskollision, weil die lokale Variable umbenannt ist.
  - Vor dem schließenden `</div>` der Seite: `<ArtikelListeMerker />`.

- [ ] **Step 6: Prüfen**

Run: `npx eslint app/admin/products/page.tsx && npm test 2>&1 | tail -8`
Expected: keine Fehler, Tests grün. Unbenutzte Reste (`istAdminProductSort`, `href`, `flagIds`) entfernen, falls ESLint sie meldet.

- [ ] **Step 7: Commit**

```bash
git add app/admin/products/page.tsx
git commit -m "feat(artikel): Warengruppen-, Gruppen-, Preis- und Bestandsfilter mit Chip-Leiste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dokumentation und Gesamtprüfung

**Files:**
- Modify: `docs/lager.md` (neuer Abschnitt am Ende), `CLAUDE.md` (eine Zeile in der Tabelle unter `/admin/products` ist nicht nötig; nur `docs/lager.md`)

- [ ] **Step 1: Abschnitt anhängen**

```markdown
## 🔎 Artikelliste: Filter, Sortierung, Rücksprung

`/admin/products`. Der Filterzustand steht komplett in der Adresszeile;
`lib/admin-product-filter.ts` liest ihn (`leseArtikelFilter`) und baut ihn
(`baueArtikelQuery`) – **eine Stelle**, kein handgebauter Link daneben.

- **Gefiltert wird in der Anwendung**, nicht in der Abfrage, außer Suche, Bild,
  Sichtbarkeit, Flags und Datumsreihenfolge (`getAdminProducts`). Grund: Die
  Zahlen an Warengruppe und Lagerkacheln brauchen die ungefilterte Menge.
- **UND zwischen den Filterarten, ODER innerhalb** von Warengruppe,
  Artikelgruppe und Flags.
- **Preisbereich** gilt für die Grundstaffel (`grundpreis()`, dieselbe Zahl wie
  die GH-Zelle), **Bestandsbereich** für `freeStock()`. Leer = unbegrenzt.
  Die Felder sind bewusst keine `NumericInput`: leer darf nicht 0 werden.
- **Sortierung**: Name, Warengruppe (dann Name), Artikelnummer, Preis, Bestand,
  Datum. Artikel ohne Preis stehen bei der Preissortierung immer hinten.
- **Rücksprung**: `lib/artikel-ruecksprung.ts` merkt beim Klick auf „Bearbeiten"
  Adresse, Scrollhöhe und Artikel in `sessionStorage`. „Speichern & zur Liste",
  „Abbrechen" und „Alle Artikel" führen dorthin zurück und scrollen zur Zeile.
  Das Menü „Artikel" startet frisch. Nur Adressen unter `/admin/products?…`
  werden akzeptiert.
```

- [ ] **Step 2: Alles laufen lassen**

Run: `npm test 2>&1 | tail -8 && npm run lint 2>&1 | tail -15 && npm run build 2>&1 | tail -25`
Expected: Tests grün, Lint ohne Fehler, Build erfolgreich.

- [ ] **Step 3: Im Browser prüfen** (Dev-Server `npm run dev`, als Admin anmelden)
  1. Warengruppe wählen → Liste zeigt nur diese, Chip erscheint, × entfernt ihn.
  2. Sortierung „Warengruppe" → Gruppen alphabetisch, darin nach Name.
  3. Preis 1–2 und Bestand ab 10 → Chips, Treffer plausibel.
  4. Suche „ball", weit nach unten scrollen, Artikel bearbeiten → „Speichern & zur Liste" → gleiche Suche, Zeile mittig sichtbar.
  5. Dasselbe mit „Abbrechen" und „Alle Artikel". Menü „Artikel" → frische Liste.

- [ ] **Step 4: Commit**

```bash
git add docs/lager.md
git commit -m "docs(artikel): Filter, Sortierung und Rücksprung der Artikelliste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Selbstprüfung gegen die Spec

- Warengruppen-Filter mit Zahl → Task 4 (Aufklapper, `zaehleKategorien`). ✔
- Artikelgruppen-Filter + „Nur Ausführungen" → Task 1 (`filtereArtikel`), Task 4. ✔
- „Ohne Warengruppe" → entfällt (NOT NULL), oben vermerkt. ✔
- Sortierungen inkl. Warengruppe → Task 1. ✔
- Preis-/Bestandsbereich → Task 1, 4. ✔
- Chip-Leiste, `baueArtikelQuery` → Task 1, 4. ✔
- Rücksprung: Speichern & zur Liste, Abbrechen, Alle Artikel, Scrollposition, nur beim Zurück → Task 2, 3, 4. ✔
- Tests, Doku → Task 1, 2, 5. ✔
