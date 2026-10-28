import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Eigener Text eines Artikels mit „Preis auf Anfrage" (Migration 078); null =
 * keiner gepflegt oder Migration fehlt – dann gilt der Standardtext.
 */
export async function getPreisAnfrageText(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preis_auf_anfrage_text", { p_id: id });
  if (error) {
    if (error.code !== "42883" && error.code !== "PGRST202") {
      console.error("[katalog] Text Preis auf Anfrage:", error.message);
    }
    return null;
  }
  return typeof data === "string" && data.trim() ? data : null;
}
