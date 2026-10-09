import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/verification-crypto";

/**
 * Startpasswort eines vom Admin angelegten Kunden, verschlüsselt abgelegt
 * (Migration 062), bis der Kunde sein eigenes gesetzt hat. So kann der Admin
 * es auch Wochen später noch weitergeben.
 *
 * Alles mit dem Service-Key; Aufrufer prüfen vorher requireAdmin(). Der
 * Schlüssel stammt wie bei der E-Mail-Bestätigung aus SUPABASE_SERVICE_KEY –
 * wird er gedreht, sind abgelegte Passwörter nicht mehr lesbar, und der Admin
 * erzeugt ein neues.
 */

function secret(): string {
  return process.env.SUPABASE_SERVICE_KEY ?? "";
}

export async function saveStartPassword(userId: string, password: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("customer_start_passwords")
    .upsert(
      {
        user_id: userId,
        password_enc: encryptSecret(password, secret()),
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  // Fehlt die Tabelle (Migration 062 nicht eingespielt), bleibt das Anlegen
  // trotzdem möglich – das Passwort wird dann wie bisher einmal angezeigt.
  if (error) console.error("[startpasswort] speichern:", error.message);
}

/** Klartext oder null (nicht gespeichert, nicht lesbar, Tabelle fehlt). */
export async function readStartPassword(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("customer_start_passwords")
    .select("password_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  try {
    return decryptSecret(data.password_enc as string, secret());
  } catch {
    return null;
  }
}

export async function deleteStartPassword(userId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("customer_start_passwords")
    .delete()
    .eq("user_id", userId);
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    console.error("[startpasswort] löschen:", error.message);
  }
}
