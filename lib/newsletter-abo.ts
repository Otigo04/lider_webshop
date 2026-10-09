import "server-only";
import { abmeldeTokenGueltig } from "@/lib/newsletter-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Abmeldung vom Newsletter über den signierten Link aus der Mail – ohne Login.
 * Kein Server-Action-Export: die Funktion darf nur von Code aufgerufen werden,
 * der Kennung und Signatur geprüft hat (hier selbst).
 */
export async function meldeNewsletterAb(userId: string, token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !abmeldeTokenGueltig(userId, token)) return false;

  const { error } = await createAdminClient()
    .from("users")
    .update({ newsletter_abo: false, newsletter_abgemeldet_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    console.error("[newsletter] Abmelden:", error.message);
    return false;
  }
  return true;
}
