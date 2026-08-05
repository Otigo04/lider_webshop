import { toNumber } from "@/lib/format";
import type { PriceTier } from "@/lib/types";

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

/** Positionssumme für eine Menge. 0, wenn keine Staffel greift. */
export function lineTotal(variants: PriceTier[], quantity: number): number {
  const tier = resolveTier(variants, quantity);
  if (!tier) return 0;
  return toNumber(tier.unit_price) * quantity;
}

// --- Bestand ----------------------------------------------------------------

/** Ab diesem Wert gilt der Bestand als knapp (gelbes Badge). */
export const LOW_STOCK_THRESHOLD = 50;

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
