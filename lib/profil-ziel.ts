import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { profilLuecken } from "@/lib/profil";

/**
 * Wohin nach dem Login: bei einem Kunden mit Lücken im Profil, der noch nicht
 * erinnert wurde, auf die Seite zum Ergänzen – genau einmal. Alles andere
 * läuft unverändert auf `ziel`.
 *
 * Die Erinnerung (users.profil_erinnert_at, Migration 062) wird bewusst in
 * einer eigenen Abfrage gelesen: fehlt die Spalte noch, darf das nicht den
 * Login lahmlegen – dann gilt der Kunde als bereits erinnert.
 */
export async function zielNachLogin(
  supabase: SupabaseClient,
  userId: string,
  ziel: string,
): Promise<string> {
  const { data: profil } = await supabase
    .from("users")
    .select("role, full_name, company_name, billing_street, billing_zip, billing_city")
    .eq("id", userId)
    .maybeSingle();
  if (!profil || profil.role !== "customer") return ziel;
  if (profilLuecken(profil).length === 0) return ziel;

  const { data: merker, error } = await supabase
    .from("users")
    .select("profil_erinnert_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || merker?.profil_erinnert_at) return ziel;

  return `/account/vervollstaendigen?weiter=${encodeURIComponent(ziel)}`;
}
