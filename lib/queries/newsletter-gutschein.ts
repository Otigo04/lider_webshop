import "server-only";
import { createClient } from "@/lib/supabase/server";
import { angebotAusDaten, type NewsletterAngebot } from "@/lib/newsletter-angebot";

/**
 * Das Angebot hinter dem Newsletter-Gutschein, ohne Code (Migration 076).
 * Fehlt die Funktion noch (Migration nicht eingespielt) oder läuft kein
 * Gutschein, gibt es kein Angebot – die Seiten zeigen dann nur „Newsletter".
 */
export async function getNewsletterAngebot(): Promise<NewsletterAngebot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("newsletter_angebot");
  if (error) {
    // 42883 / PGRST202: Funktion unbekannt, Migration 076 fehlt.
    if (error.code !== "42883" && error.code !== "PGRST202") {
      console.error("[newsletter] Angebot:", error.message);
    }
    return null;
  }
  return angebotAusDaten(data);
}

/** Der Code für das angemeldete Konto – nur für Abonnenten, solange er einlösbar ist. */
export async function getMeinNewsletterGutschein(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mein_newsletter_gutschein");
  if (error) {
    if (error.code !== "42883" && error.code !== "PGRST202") {
      console.error("[newsletter] Eigener Code:", error.message);
    }
    return null;
  }
  return typeof data === "string" && data ? data : null;
}

/** Abo-Stand des angemeldeten Kunden samt Code, für den Abschnitt auf der Startseite. */
export async function getNewsletterStand(
  userId: string,
): Promise<{ abonniert: boolean; code: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("newsletter_abo")
    .eq("id", userId)
    .maybeSingle();
  const abonniert = Boolean(data?.newsletter_abo);
  return { abonniert, code: abonniert ? await getMeinNewsletterGutschein() : null };
}
