import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Papierkorb für gelöschte Artikel (Migration 061).
 *
 * Fehlt die Tabelle noch (Migration nicht eingespielt), ist der Papierkorb
 * schlicht leer – die Artikelliste darf daran nicht scheitern.
 */

export interface GeloeschterArtikel {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  geloeschtAm: string;
  von: string | null;
  bestand: number | null;
}

export async function countDeletedProducts(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("deleted_products")
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function getDeletedProducts(): Promise<GeloeschterArtikel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deleted_products")
    .select(
      "id, sku, name, barcode, deleted_at, snapshot, deleter:users!deleted_products_deleted_by_fkey (full_name, email)",
    )
    .order("deleted_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[papierkorb] Liste:", error.message);
    }
    return [];
  }

  return (
    (data ?? []) as unknown as {
      id: string;
      sku: string;
      name: string;
      barcode: string | null;
      deleted_at: string;
      snapshot: { product?: { stock_available?: number } } | null;
      deleter: { full_name: string | null; email: string } | null;
    }[]
  ).map((z) => ({
    id: z.id,
    sku: z.sku,
    name: z.name,
    barcode: z.barcode,
    geloeschtAm: z.deleted_at,
    von: z.deleter ? z.deleter.full_name || z.deleter.email : null,
    bestand: z.snapshot?.product?.stock_available ?? null,
  }));
}
