import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "rpc">;

let funktionFehltGemeldet = false;

/**
 * Welche dieser Artikel sind „Preis auf Anfrage" (Migration 077)? Der Shop
 * blendet deren Preise aus und lässt sie nicht in den Warenkorb. Fragt über
 * `preis_auf_anfrage()`, nicht über eine Spalte der Abfrage selbst: so läuft
 * der Shop ohne Fehler weiter, solange die Migration noch nicht eingespielt ist
 * (dann ist die Menge leer).
 */
export async function anfrageIds(supabase: Client, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc("preis_auf_anfrage", { p_ids: ids });
  if (error) {
    // 42883 / PGRST202: Funktion unbekannt, Migration 077 fehlt.
    if (error.code !== "42883" && error.code !== "PGRST202") {
      console.error("[katalog] Preis auf Anfrage:", error.message);
    } else if (!funktionFehltGemeldet) {
      funktionFehltGemeldet = true;
      console.warn("[katalog] Migration 077 (Preis auf Anfrage) fehlt – alle Preise bleiben sichtbar.");
    }
    return new Set();
  }
  return new Set((data ?? []) as string[]);
}
