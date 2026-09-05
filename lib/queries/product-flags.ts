import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProductFlagDef } from "@/lib/types";

/**
 * Frei definierbare Artikel-Flags (Migration 021) – admin-verwaltet in
 * /admin/settings, zugewiesen über ProductFlagsMenu, gefiltert in
 * /admin/products. Rein intern, kein Bezug zu products_public.
 */
export async function getProductFlags(): Promise<ProductFlagDef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_flags")
    .select("*")
    .order("created_at");

  if (error) {
    console.error("[admin] Artikel-Flags:", error.message);
    return [];
  }
  return data as ProductFlagDef[];
}
