import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { parseOeffnungszeiten, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";

/**
 * Öffnungszeiten für jede Seite, auch ohne Sitzung (RPC aus Migration 071).
 * Fehlt die Funktion noch, gilt die Vorbelegung – die Seiten zeigen dann
 * dieselben Zeiten, die die Migration ohnehin einträgt.
 */
export async function getOeffnungszeiten(): Promise<Oeffnungszeiten> {
  const { data, error } = await createPublicClient().rpc("public_opening_hours");
  if (error) {
    console.error("[einstellungen] Öffnungszeiten:", error.message);
    return parseOeffnungszeiten(null);
  }
  return parseOeffnungszeiten(data);
}
