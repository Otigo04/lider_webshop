import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sucheWortweise } from "@/lib/search";
import type { StockEntry } from "@/lib/types";

/**
 * Wareneingangsjournal (Migration 030).
 *
 * Lesezugriff über den Session-Client, damit RLS greift – stock_entries ist
 * per Policy auf Admins beschränkt.
 */

export interface StockEntryWithUser extends StockEntry {
  erfasser: { full_name: string | null; email: string } | null;
}

export interface StockEntryFilters {
  /** ISO-Datum (YYYY-MM-DD), inklusive */
  from?: string;
  /** ISO-Datum (YYYY-MM-DD), inklusive */
  to?: string;
  /** Bezeichnung, Artikelnummer oder Barcode */
  search?: string;
  limit?: number;
}

export async function getStockEntries(
  filters: StockEntryFilters = {},
): Promise<StockEntryWithUser[]> {
  const supabase = await createClient();

  let query = supabase
    .from("stock_entries")
    .select("*, erfasser:users!stock_entries_created_by_fkey (full_name, email)")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) {
    // Bis einschließlich dieses Tages – verglichen wird gegen den Anfang des
    // Folgetags, sonst fiele alles nach Mitternacht heraus.
    const bis = new Date(`${filters.to}T00:00:00`);
    bis.setDate(bis.getDate() + 1);
    query = query.lt("created_at", bis.toISOString());
  }

  const term = filters.search?.trim();
  if (term) {
    const sauber = term.replace(/[,()*\\%"]/g, " ").trim();
    if (sauber.length >= 2) {
      query = sucheWortweise(
        query,
        ["product_name", "product_sku", "barcode"],
        sauber,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[wareneingang] Journal laden:", error.message);
    return [];
  }
  return (data ?? []) as unknown as StockEntryWithUser[];
}

export interface StockEntrySummary {
  buchungen: number;
  stueck: number;
  neueArtikel: number;
}

/** Kennzahlen des Journals im geladenen Zeitraum – summiert die Seite, nicht die DB. */
export function summiere(entries: StockEntry[]): StockEntrySummary {
  return {
    buchungen: entries.length,
    stueck: entries.reduce((summe, eintrag) => summe + eintrag.quantity, 0),
    neueArtikel: entries.filter((eintrag) => eintrag.is_new_product).length,
  };
}

/**
 * Artikel einer Buchung – für die Preisschilder der Lieferung.
 *
 * Eine Buchung hat keine eigene Kennung, aber einen eigenen Zeitpunkt:
 * record_stock_entries() läuft in einer Transaktion, alle ihre Zeilen tragen
 * dasselbe now(). Eine Buchungstabelle nur dafür wäre ein zweiter Ort, an dem
 * dieselbe Lieferung steht.
 */
export async function getEingangProductIds(zeitpunkt: string): Promise<string[]> {
  if (Number.isNaN(Date.parse(zeitpunkt))) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_entries")
    .select("product_id")
    .eq("created_at", zeitpunkt)
    .not("product_id", "is", null);

  if (error) {
    console.error("[wareneingang] Positionen der Buchung:", error.message);
    return [];
  }

  return [...new Set((data ?? []).map((zeile) => zeile.product_id as string))];
}

/**
 * Zuletzt aufgenommene Artikel, der jüngste zuerst, jeder einmal.
 *
 * Für „die letzten zehn als Preisschild": wer gerade einen Karton gebucht
 * hat, will dessen Schilder und sucht die Artikel nicht noch einmal
 * zusammen. Aus dem Journal gelesen statt gemerkt – so gilt es an jedem
 * Gerät.
 */
export async function getZuletztAufgenommen(anzahl = 200): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_entries")
    .select("product_id")
    .not("product_id", "is", null)
    .order("created_at", { ascending: false })
    // Mehr Zeilen als Artikel: derselbe Artikel kann mehrfach gebucht sein.
    .limit(anzahl * 3);

  if (error) {
    console.error("[wareneingang] Zuletzt aufgenommen:", error.message);
    return [];
  }

  return [...new Set((data ?? []).map((zeile) => zeile.product_id as string))].slice(
    0,
    anzahl,
  );
}
