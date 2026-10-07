import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { credentialsEmail, verificationEmail } from "@/lib/emails/verification";
import {
  VERIFICATION_TTL_HOURS,
  decryptSecret,
  encryptSecret,
  hashToken,
  newToken,
} from "@/lib/verification-crypto";

/**
 * E-Mail-Bestätigung neuer Konten (Migration 058). Konten sind bis zum Klick
 * auf den Link inaktiv (`users.is_active = false`, `verified_at = null`).
 * Alles hier läuft mit dem Service-Key; Aufrufer prüfen vorher die Berechtigung.
 */

function secret(): string {
  return process.env.SUPABASE_SERVICE_KEY ?? "";
}

/** Konto als „unbestätigt“ markieren. */
export async function markUnverified(userId: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("users")
    .update({ is_active: false, verified_at: null })
    .eq("id", userId);
  if (error) console.error("[verification] markieren:", error.message);
  return !error;
}

/**
 * Legt den Bestätigungsdatensatz an. Beim Admin-Konto wird das Startpasswort
 * verschlüsselt abgelegt, bis der Kunde bestätigt hat.
 */
export async function createVerification(
  userId: string,
  kind: "selbst" | "admin",
  tempPassword?: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("email_verifications")
    .upsert(
      {
        user_id: userId,
        kind,
        token_hash: null,
        sent_at: null,
        expires_at: null,
        temp_password_enc: tempPassword ? encryptSecret(tempPassword, secret()) : null,
      },
      { onConflict: "user_id" },
    );
  if (error) console.error("[verification] anlegen:", error.message);
}

/** Neues Startpasswort für ein noch unbestätigtes Admin-Konto nachziehen. */
export async function updatePendingPassword(userId: string, tempPassword: string): Promise<void> {
  await createAdminClient()
    .from("email_verifications")
    .update({ temp_password_enc: encryptSecret(tempPassword, secret()) })
    .eq("user_id", userId)
    .not("temp_password_enc", "is", null);
}

/** Neues Token erzeugen (macht ein älteres ungültig) und die Mail schicken. */
export async function sendVerification(
  userId: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const db = createAdminClient();
  const { data: user } = await db
    .from("users")
    .select("email, full_name, verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return { ok: false, error: "Kunde nicht gefunden." };
  if (user.verified_at) return { ok: false, error: "Die Adresse ist bereits bestätigt." };

  const token = newToken();
  const { data: updated, error } = await db
    .from("email_verifications")
    .update({
      token_hash: hashToken(token),
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600_000).toISOString(),
    })
    .eq("user_id", userId)
    .select("id");
  if (error || !updated?.length) {
    console.error("[verification] Token:", error?.message ?? "kein Datensatz");
    return { ok: false, error: "Die Bestätigung konnte nicht vorbereitet werden." };
  }

  const mail = verificationEmail(token, VERIFICATION_TTL_HOURS, user.full_name);
  await sendEmail({ to: user.email, ...mail });
  return { ok: true, email: user.email };
}

/**
 * Löst das Token ein: Konto aktivieren, Adresse als bestätigt vermerken, bei
 * Admin-Konten die Zugangsdaten schicken. Atomar: nur der erste Aufruf gewinnt.
 */
export async function redeemVerification(token: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("email_verifications")
    .delete()
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .select("user_id, kind, temp_password_enc")
    .maybeSingle();
  if (!row) return false;

  const { data: user, error } = await db
    .from("users")
    .update({ is_active: true, verified_at: new Date().toISOString() })
    .eq("id", row.user_id)
    .select("email, full_name")
    .maybeSingle();
  if (error || !user) {
    console.error("[verification] aktivieren:", error?.message);
    return false;
  }

  if (row.kind === "admin" && row.temp_password_enc) {
    try {
      const password = decryptSecret(row.temp_password_enc, secret());
      await sendEmail({ to: user.email, ...credentialsEmail(user.email, password, user.full_name) });
    } catch (e) {
      console.error("[verification] Zugangsdaten:", e instanceof Error ? e.message : e);
    }
  }
  return true;
}
