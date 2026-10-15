import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Darf der angemeldete Kunde auf Rechnung kaufen? (Migration 072: mindestens
 * eine als bezahlt markierte Rechnung.) Bei einem Fehler – etwa weil die
 * Migration noch fehlt – gilt „nein": Vorkasse ist die sichere Seite.
 */
export async function getDarfAufRechnung(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("darf_auf_rechnung");
  if (error) {
    console.error("[bestellung] darf_auf_rechnung:", error.message);
    return false;
  }
  return data === true;
}
