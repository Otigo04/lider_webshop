import "server-only";
import { sendEmail } from "@/lib/email";
import { newsletterGutscheinEmail } from "@/lib/emails/newsletter-gutschein";
import { angebotAusDaten } from "@/lib/newsletter-angebot";
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

/**
 * Schickt neuen Abonnenten den Willkommensgutschein (Migration 076) – höchstens
 * einmal je Konto. Aufgerufen von jeder Stelle, an der ein Abo entsteht:
 * Startseite, Konto, und nach der Bestätigung der Adresse bei der Registrierung.
 *
 * - Nur für Konten mit Abo, aktiv, und noch ohne geschickten Code. Der
 *   Zeitstempel wird atomar gesetzt: zwei gleichzeitige Aufrufe schicken eine Mail.
 * - Mit `nur_erstbestellung` bekommt kein Bestandskunde eine Mail, der den Code
 *   gar nicht mehr einlösen könnte.
 * - Scheitert der Versand, wird der Zeitstempel zurückgenommen: der nächste
 *   Versuch ist möglich, und der Code steht bis dahin im Konto.
 *
 * Wirft nie: ein Fehler hier darf das Abonnieren nicht kippen.
 */
export async function schickeNewsletterGutschein(userId: string): Promise<void> {
  try {
    const db = createAdminClient();

    const { data: v } = await db
      .from("vouchers")
      .select(
        "id, code, kind, value, min_order_amount, nur_erstbestellung, category_ids, valid_from, valid_until, max_redemptions",
      )
      .eq("fuer_newsletter", true)
      .eq("is_active", true)
      .is("customer_id", null)
      .maybeSingle();
    if (!v) return;

    const jetzt = Date.now();
    if (v.valid_from && new Date(v.valid_from).getTime() > jetzt) return;
    if (v.valid_until && new Date(v.valid_until).getTime() <= jetzt) return;

    const angebot = angebotAusDaten({
      kind: v.kind,
      value: v.value,
      min_order_amount: v.min_order_amount,
      nur_erstbestellung: v.nur_erstbestellung,
      begrenzt: (v.category_ids ?? []).length > 0,
    });
    if (!angebot) return;

    if (v.nur_erstbestellung) {
      const { count } = await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", userId)
        .not("status", "in", "(draft,cancelled)");
      if ((count ?? 0) > 0) return;
    }

    const { data: user } = await db
      .from("users")
      .update({ newsletter_gutschein_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("newsletter_abo", true)
      .eq("is_active", true)
      .is("newsletter_gutschein_at", null)
      .select("email, full_name")
      .maybeSingle();
    if (!user) return;

    const mail = newsletterGutscheinEmail(v.code, angebot, user.full_name);
    const ok = await sendEmail({ to: user.email, ...mail });
    if (!ok) {
      await db.from("users").update({ newsletter_gutschein_at: null }).eq("id", userId);
    }
  } catch (e) {
    console.error("[newsletter] Gutschein schicken:", e instanceof Error ? e.message : e);
    return;
  }
}
