"use server";

import { requireAdmin } from "@/lib/auth";
import { toNumber } from "@/lib/format";
import { freeStock } from "@/lib/pricing";
import { getImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Artikelauskunft: Code scannen, sehen, welcher Artikel das ist.
 *
 * Nur lesen, nichts buchen. Mit Einkaufspreis (Entscheidung des Betreibers):
 * die Seite ist ein interner Infopunkt, Admin-Login Pflicht. Der Einkaufspreis
 * wird nur hier und in der Artikelverwaltung geladen, nie an Kunden.
 */

export interface ArtikelAuskunft {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  kategorie: string | null;
  /** Name des Angebots, wenn der Artikel eine Ausführung ist */
  gruppe: string | null;
  beschreibung: string | null;
  bildUrl: string | null;
  frei: number;
  reserviert: number;
  gesamt: number;
  /** Ladenpreis, null = nicht gepflegt */
  laden: number | null;
  vorher: number | null;
  staffeln: { ab: number; preis: number }[];
  /** Einkaufspreis (product_costs), null = nicht gepflegt */
  einkauf: number | null;
  aktiv: boolean;
  neu: boolean;
  topseller: boolean;
  /** Die letzten Wareneingänge, neueste zuerst */
  zugaenge: { am: string; menge: number }[];
}

export type AuskunftErgebnis =
  | { treffer: ArtikelAuskunft }
  | { unbekannt: string }
  | { fehler: string };

const SPALTEN = `id, sku, name, barcode, description, retail_price, list_price,
  stock_available, stock_reserved, is_active, is_new, is_topseller,
  category:categories (name),
  group:product_groups (name),
  variants:product_variants (min_quantity, unit_price),
  images:product_images (file_path, display_order)`;

interface Zeile {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  description: string | null;
  retail_price: number | string | null;
  list_price: number | string | null;
  stock_available: number;
  stock_reserved: number;
  is_active: boolean;
  is_new: boolean;
  is_topseller: boolean;
  category: { name: string } | null;
  group: { name: string } | null;
  variants: { min_quantity: number; unit_price: number | string }[];
  images: { file_path: string; display_order: number }[];
}

/**
 * Schreibweisen, unter denen derselbe Code im Stamm stehen kann: Scanner
 * liefern einen UPC-A (12) oft als EAN-13 mit führender Null und umgekehrt.
 * Der Code selbst kommt zuerst – er ist eindeutig.
 */
function kandidaten(roh: string): string[] {
  const code = roh.trim();
  const liste = [code];
  if (/^\d{12}$/.test(code)) liste.push(`0${code}`);
  if (/^0\d{12}$/.test(code)) liste.push(code.slice(1));
  return liste;
}

export async function artikelAuskunft(code: string): Promise<AuskunftErgebnis> {
  await requireAdmin();
  const gesucht = String(code ?? "").trim().slice(0, 64);
  if (!gesucht) return { fehler: "Kein Code eingegeben." };

  const supabase = await createClient();
  let zeile: Zeile | null = null;

  for (const feld of ["barcode", "sku"] as const) {
    const { data, error } = await supabase
      .from("products")
      .select(SPALTEN)
      .in(feld, kandidaten(gesucht))
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[artikelinfo] Suche:", error.message);
      return { fehler: "Die Suche ist fehlgeschlagen. Bitte noch einmal scannen." };
    }
    if (data) {
      zeile = data as unknown as Zeile;
      break;
    }
  }
  if (!zeile) return { unbekannt: gesucht };

  const erstes = [...(zeile.images ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  )[0];

  const [bildUrl, kosten, zugaenge] = await Promise.all([
    getImageUrl(erstes?.file_path),
    supabase
      .from("product_costs")
      .select("cost_price")
      .eq("product_id", zeile.id)
      .maybeSingle(),
    supabase
      .from("stock_entries")
      .select("created_at, quantity")
      .eq("product_id", zeile.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const preis = (wert: number | string | null) => {
    const zahl = wert === null ? 0 : toNumber(wert);
    return zahl > 0 ? zahl : null;
  };

  return {
    treffer: {
      id: zeile.id,
      sku: zeile.sku,
      name: zeile.name,
      barcode: zeile.barcode,
      kategorie: zeile.category?.name ?? null,
      gruppe: zeile.group?.name ?? null,
      beschreibung: zeile.description?.trim() || null,
      bildUrl,
      frei: freeStock(zeile),
      reserviert: toNumber(zeile.stock_reserved),
      gesamt: toNumber(zeile.stock_available),
      laden: preis(zeile.retail_price),
      vorher: preis(zeile.list_price),
      staffeln: (zeile.variants ?? [])
        .map((v) => ({ ab: v.min_quantity, preis: toNumber(v.unit_price) }))
        .filter((s) => s.preis > 0)
        .sort((a, b) => a.ab - b.ab),
      einkauf: preis((kosten.data?.cost_price as number | string | null) ?? null),
      aktiv: zeile.is_active,
      neu: zeile.is_new,
      topseller: zeile.is_topseller,
      zugaenge: (zugaenge.data ?? []).map((z) => ({
        am: z.created_at as string,
        menge: toNumber(z.quantity),
      })),
    },
  };
}
