"use server";

import { getImageUrls } from "@/lib/storage";

/**
 * Signierte Bild-URLs für den Warenkorb.
 *
 * Der Warenkorb liegt im localStorage und kennt deshalb nur Storage-Pfade,
 * keine URLs: eine signierte URL läuft nach Stunden ab, ein Warenkorb steht
 * gern tagelang. Die Bilder werden darum erst beim Anzeigen signiert.
 *
 * Der Bucket `products` ist privat; welche Pfade jemand signieren darf, regelt
 * die Storage-Policy (Migration 012), nicht diese Funktion – sie läuft über
 * den Client des angemeldeten Nutzers.
 */
export async function signCartImages(paths: string[]): Promise<(string | null)[]> {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  // Deckel gegen einen aufgeblähten localStorage: mehr Positionen als das
  // hat kein Warenkorb, und jede kostet eine Signatur.
  const begrenzt = paths.slice(0, 100);
  return getImageUrls(begrenzt);
}
