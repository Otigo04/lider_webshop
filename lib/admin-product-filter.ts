import type { AdminProductRow } from "@/lib/queries/admin";
import { freeStock, lowestUnitPrice, reduzierung, stockLevel } from "@/lib/pricing";

/**
 * Schnellfilter der Artikelliste.
 *
 * Was hier steht, sind Fragen, die im Laden täglich anfallen: Was ist alle?
 * Was geht zur Neige? Was hat kein Etikett und lässt sich an der Kasse nicht
 * scannen? Alle beantworten sich aus Feldern, die ohnehin geladen sind –
 * deshalb wird in der Anwendung gefiltert und nicht in der Abfrage.
 *
 * Der zweite Grund ist die Zählung: die Kacheln sollen auch die Zahl zeigen,
 * die *nicht* gewählt ist („12 ausverkauft"). Dafür braucht es die
 * ungefilterte Menge; ein Filter in der Abfrage hätte sie schon weggeworfen.
 * Zwei davon – Bestand und Reduzierung – ließen sich über PostgREST ohnehin
 * nicht ausdrücken: sie rechnen über Spalten und Preisstaffeln hinweg.
 */

export const LAGER_FILTER = [
  "ausverkauft",
  "knapp",
  "ohne-barcode",
  "ohne-ladenpreis",
  "ohne-preis",
  "reduziert",
] as const;

export type LagerFilter = (typeof LAGER_FILTER)[number];

export const LAGER_FILTER_LABELS: Record<LagerFilter, string> = {
  ausverkauft: "Ausverkauft",
  knapp: "Bestand knapp",
  "ohne-barcode": "Ohne Barcode",
  "ohne-ladenpreis": "Ohne Ladenpreis",
  "ohne-preis": "Ohne Staffelpreis",
  reduziert: "Reduziert",
};

/** Warum das wichtig ist – steht als Titel an der Kachel, nicht im Handbuch. */
export const LAGER_FILTER_HILFE: Record<LagerFilter, string> = {
  ausverkauft: "Nichts mehr frei verfügbar – im Shop nicht bestellbar.",
  knapp: "Nachbestellen, bevor der Artikel ausgeht.",
  "ohne-barcode": "An der Ladenkasse nicht scannbar.",
  "ohne-ladenpreis": "Die Kasse fällt auf den Großhandelspreis zurück.",
  "ohne-preis": "Ohne Preisstaffel im Shop nicht bestellbar.",
  reduziert: "Vorher-Preis gepflegt und Ersparnis sichtbar.",
};

export function istLagerFilter(wert: unknown): wert is LagerFilter {
  return (
    typeof wert === "string" && (LAGER_FILTER as readonly string[]).includes(wert)
  );
}

function trifftZu(product: AdminProductRow, filter: LagerFilter): boolean {
  const frei = freeStock(product);

  switch (filter) {
    case "ausverkauft":
      return stockLevel(frei) === "out";
    case "knapp":
      return stockLevel(frei) === "low";
    case "ohne-barcode":
      return !product.barcode;
    case "ohne-ladenpreis":
      return product.retail_price === null || product.retail_price === undefined;
    case "ohne-preis":
      return lowestUnitPrice(product.variants) === null;
    case "reduziert":
      return (
        reduzierung(
          product.list_price,
          lowestUnitPrice(product.variants),
          product.retail_price,
        ) !== null
      );
  }
}

/**
 * UND-verknüpft: „ausverkauft" und „ohne Barcode" zusammen meint die
 * Schnittmenge. Wer zwei Fragen gleichzeitig stellt, sucht die Artikel, auf
 * die beide zutreffen – ein ODER brächte eine längere Liste statt einer
 * kürzeren und wäre das Gegenteil eines Filters.
 */
export function filtereNachLager(
  products: AdminProductRow[],
  filter: LagerFilter[],
): AdminProductRow[] {
  if (filter.length === 0) return products;
  return products.filter((product) =>
    filter.every((einzeln) => trifftZu(product, einzeln)),
  );
}

/** Wie viele Artikel jeder Filter träfe – für die Zahl an der Kachel. */
export function zaehleLager(
  products: AdminProductRow[],
): Record<LagerFilter, number> {
  const zaehler = Object.fromEntries(
    LAGER_FILTER.map((filter) => [filter, 0]),
  ) as Record<LagerFilter, number>;

  for (const product of products) {
    for (const filter of LAGER_FILTER) {
      if (trifftZu(product, filter)) zaehler[filter] += 1;
    }
  }
  return zaehler;
}

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
