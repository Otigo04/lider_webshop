import { toNumber } from "@/lib/format";
import type { PosPriceMode, PriceTier } from "@/lib/types";

/**
 * Staffelpreis-Logik. Eine Staffel gilt von `min_quantity` bis `max_quantity`
 * (null = offen nach oben). Der Preis richtet sich nach der Gesamtmenge der
 * Position, nicht nach dem Warenkorbwert.
 */

/** Aufsteigend nach Mindestmenge. Alle anderen Funktionen setzen das voraus. */
export function sortTiers(variants: PriceTier[]): PriceTier[] {
  return [...variants].sort((a, b) => a.min_quantity - b.min_quantity);
}

/** Kleinste bestellbare Menge des Artikels. */
export function minOrderQuantity(variants: PriceTier[]): number {
  if (variants.length === 0) return 0;
  return Math.min(...variants.map((v) => v.min_quantity));
}

/**
 * Passende Staffel zur Menge. null, wenn die Menge unter der Mindestmenge
 * liegt oder gar keine Staffeln gepflegt sind.
 *
 * Bei Lücken zwischen den Staffeln (z. B. 1-49 und 100+, Menge 60) greift die
 * höchste Staffel, deren Mindestmenge erreicht ist – der Kunde zahlt nie mehr
 * als die zuletzt erreichte Stufe.
 */
export function resolveTier(
  variants: PriceTier[],
  quantity: number,
): PriceTier | null {
  let match: PriceTier | null = null;
  for (const tier of sortTiers(variants)) {
    if (quantity >= tier.min_quantity) match = tier;
  }
  return match;
}

/** Niedrigster Stückpreis – der „ab"-Preis in der Artikelübersicht. */
export function lowestUnitPrice(variants: PriceTier[]): number | null {
  if (variants.length === 0) return null;
  return Math.min(...variants.map((v) => toNumber(v.unit_price)));
}

/** Höchster Stückpreis – zusammen mit lowestUnitPrice die Preisspanne. */
export function highestUnitPrice(variants: PriceTier[]): number | null {
  if (variants.length === 0) return null;
  return Math.max(...variants.map((v) => toNumber(v.unit_price)));
}

/**
 * Preisspanne für die Artikelübersicht: { from, to }. `to` ist null, wenn es
 * nur einen Preis gibt – dann steht in der Karte kein Bereich, sondern ein
 * einzelner Preis.
 */
export function priceRange(
  variants: PriceTier[],
): { from: number; to: number | null } | null {
  const low = lowestUnitPrice(variants);
  const high = highestUnitPrice(variants);
  if (low === null || high === null) return null;
  return { from: low, to: high > low ? high : null };
}

/** Preis der kleinsten Staffel. Basis für die Rabattangabe. */
export function baseUnitPrice(variants: PriceTier[]): number | null {
  const sorted = sortTiers(variants);
  if (sorted.length === 0) return null;
  return toNumber(sorted[0].unit_price);
}

/**
 * Ersparnis gegenüber der kleinsten Staffel, gerundet auf ganze Prozent.
 * null für die kleinste Staffel selbst und wenn es nichts zu sparen gibt.
 */
export function discountPercent(
  variants: PriceTier[],
  tier: PriceTier,
): number | null {
  const base = baseUnitPrice(variants);
  if (base === null || base <= 0) return null;
  const price = toNumber(tier.unit_price);
  const percent = Math.round(((base - price) / base) * 100);
  return percent > 0 ? percent : null;
}

// --- Reduzierte Artikel ------------------------------------------------------

export interface Reduzierung {
  /** Durchgestrichener Vorher-Preis */
  vorher: number;
  /** Aktueller Preis – der günstigste, den der Kunde erreichen kann */
  jetzt: number;
  /** Ersparnis auf ganze Prozent gerundet, immer > 0 */
  prozent: number;
}

/**
 * Reduzierung eines Artikels aus dem Vorher-Preis (products.list_price,
 * Migration 023) gegenüber dem aktuellen Preis.
 *
 * Der Vorher-Preis ist ein **Ladenpreis** – so wird er gepflegt und so steht
 * er am Regal. Ob und wie stark reduziert ist, entscheidet deshalb der
 * Vergleich mit dem Ladenpreis (`ladenpreis`), nicht mit dem Preis, der gerade
 * angezeigt wird. Sonst wurde aus 9,99 → 8,99 im Laden im Shop „−55 %", weil
 * dort der Großhandelspreis von 4,50 stand.
 *
 * Zeigt der Aufrufer einen anderen Preis als den Ladenpreis (Shop:
 * Großhandel), wird der Prozentsatz auf diesen übertragen: `jetzt` ist der
 * angezeigte Preis, `vorher` derselbe Preis vor der Reduzierung. Ohne
 * gepflegten Ladenpreis gilt der angezeigte Preis selbst als Bezug – wie an
 * der Kasse, die dann auch zur Staffel greift.
 *
 * null, wenn kein Vorher-Preis gepflegt ist oder er nicht über dem Bezug
 * liegt: eine Ersparnis von 0 % oder gar eine negative wäre eine
 * Falschaussage im Schaufenster. Ebenso, wenn gerundet 0 % herauskämen – ein
 * Cent Unterschied ist kein Angebot.
 */
export function reduzierung(
  listPrice: number | null | undefined,
  aktuellerPreis: number | null | undefined,
  ladenpreis: number | null | undefined,
): Reduzierung | null {
  if (listPrice === null || listPrice === undefined) return null;
  if (aktuellerPreis === null || aktuellerPreis === undefined) return null;

  const liste = toNumber(listPrice);
  const jetzt = toNumber(aktuellerPreis);
  const laden =
    ladenpreis !== null && ladenpreis !== undefined && toNumber(ladenpreis) > 0
      ? toNumber(ladenpreis)
      : null;
  const bezug = laden ?? jetzt;
  if (!(liste > bezug) || liste <= 0) return null;

  const prozent = Math.round(((liste - bezug) / liste) * 100);
  if (prozent <= 0) return null;

  // Gleiches Verhältnis wie im Laden, auf den angezeigten Preis übertragen.
  const vorher =
    laden === null ? liste : Math.round(((jetzt * liste) / laden) * 100) / 100;
  if (!(vorher > jetzt)) return null;

  return { vorher, jetzt, prozent };
}

/** Positionssumme für eine Menge. 0, wenn keine Staffel greift. */
export function lineTotal(variants: PriceTier[], quantity: number): number {
  const tier = resolveTier(variants, quantity);
  if (!tier) return 0;
  return toNumber(tier.unit_price) * quantity;
}

/**
 * Stückpreis am Tresen. Ein Privatkunde zahlt den Ladenpreis des Artikels,
 * ein Händler mit Konto die Staffel wie im Shop.
 *
 * Ist kein Ladenpreis gepflegt, greift die Staffel – lieber der falsche Kanal
 * als ein Artikel, der sich an der Kasse nicht buchen lässt.
 */
export function counterUnitPrice(
  product: { variants: PriceTier[]; retailPrice: number | null },
  quantity: number,
  modus: PosPriceMode,
): number {
  if (modus === "retail" && product.retailPrice !== null) {
    return toNumber(product.retailPrice);
  }
  const tier = resolveTier(product.variants, quantity);
  if (tier) return toNumber(tier.unit_price);
  return baseUnitPrice(product.variants) ?? 0;
}

// --- Bestand ----------------------------------------------------------------

/**
 * Unter diesem Wert gilt der Bestand als knapp (gelbes Badge).
 *
 * Bewusst niedrig: bei 50 trug im Sortiment fast jede Karte das Warnbadge,
 * und ein Laden, in dem alles knapp ist, wirkt leer statt dringlich. Die
 * Warnung soll die Ausnahme bleiben, sonst liest sie niemand mehr.
 */
export const LOW_STOCK_THRESHOLD = 10;

export type StockLevel = "out" | "low" | "ok";

/**
 * Frei verfügbar = Bestand minus bereits reservierter Menge.
 * Reserviert wird ab Phase 4 beim Bestelleingang.
 */
export function freeStock(product: {
  stock_available: number;
  stock_reserved: number;
}): number {
  return Math.max(0, toNumber(product.stock_available) - toNumber(product.stock_reserved));
}

export function stockLevel(free: number): StockLevel {
  if (free <= 0) return "out";
  if (free < LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}
