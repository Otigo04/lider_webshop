import "server-only";
import { toNumber } from "@/lib/format";
import { warenwert, type BestandZeile } from "@/lib/bestand-export";
import { baseUnitPrice } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { PriceTier } from "@/lib/types";

/**
 * Der ganze Artikelbestand für die Exporte.
 *
 * Seitenweise gelesen: PostgREST liefert je Anfrage höchstens 1000 Zeilen, und
 * eine Bestandsliste, die bei Artikel 1000 stillschweigend aufhört, ist
 * schlimmer als keine. Ein Fehler bricht deshalb ab (und wird vom Aufrufer
 * gemeldet), statt eine unvollständige Liste auszugeben.
 *
 * Ausgeblendete Artikel (is_active = false) bleiben drin: sie liegen trotzdem
 * im Lager.
 */

const SEITE = 1000;

const SPALTEN = `id, sku, name, barcode, retail_price, stock_available,
  category:categories (name),
  cost:product_costs (cost_price),
  variants:product_variants (id, min_quantity, max_quantity, unit_price)`;

interface Zeile {
  sku: string;
  name: string;
  barcode: string | null;
  retail_price: number | string | null;
  stock_available: number | string | null;
  category: { name: string } | { name: string }[] | null;
  cost:
    | { cost_price: number | string | null }
    | { cost_price: number | string | null }[]
    | null;
  variants: PriceTier[] | null;
}

/** 0 heißt „nicht gepflegt“ – wie überall bei Preisen. */
function ueberNull(wert: number | string | null | undefined): number | null {
  if (wert === null || wert === undefined) return null;
  const zahl = toNumber(wert);
  return zahl > 0 ? zahl : null;
}

function eins<T>(wert: T | T[] | null): T | null {
  return Array.isArray(wert) ? (wert[0] ?? null) : wert;
}

export async function getBestandZeilen(): Promise<BestandZeile[]> {
  const supabase = await createClient();
  const roh: Zeile[] = [];

  for (let von = 0; ; von += SEITE) {
    const { data, error } = await supabase
      .from("products")
      .select(SPALTEN)
      .order("id")
      .range(von, von + SEITE - 1);

    if (error) throw new Error(`Artikel laden: ${error.message}`);
    const seite = (data ?? []) as unknown as Zeile[];
    roh.push(...seite);
    if (seite.length < SEITE) break;
  }

  return roh.map((z) => {
    const bestand = toNumber(z.stock_available);
    const einkauf = ueberNull(eins(z.cost)?.cost_price);
    return {
      sku: z.sku,
      barcode: z.barcode?.trim() || null,
      name: z.name,
      kategorie: eins(z.category)?.name ?? "Ohne Warengruppe",
      bestand,
      laden: ueberNull(z.retail_price),
      grosshandel: ueberNull(baseUnitPrice(z.variants ?? [])),
      einkauf,
      warenwert: warenwert(bestand, einkauf),
    };
  });
}
