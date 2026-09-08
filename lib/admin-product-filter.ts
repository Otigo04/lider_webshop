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
        reduzierung(product.list_price, lowestUnitPrice(product.variants)) !== null
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
