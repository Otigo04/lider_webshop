import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  istAboTot,
  waehleEmpfaenger,
  type AboZeile,
  type PushArt,
  type SendeErgebnis,
} from "@/lib/push-ziele";
import {
  bestellungText,
  neukundeText,
  type PushNachricht,
} from "@/lib/push-text";

/**
 * Push-Versand an die Geräte der Admin-Konten.
 *
 * Wie lib/email.ts: Fehler werden geloggt, nie geworfen. Eine bereits
 * abgeschlossene Bestellung oder Registrierung darf an einer Mitteilung nie
 * scheitern. Fehlen die VAPID-Schlüssel, wird übersprungen.
 */

let vapidBereit: boolean | null = null;

function konfiguriert(): boolean {
  if (vapidBereit !== null) return vapidBereit;
  const oeffentlich = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privat = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!oeffentlich || !privat || !subject) {
    console.warn("[push] VAPID-Schlüssel fehlen – Versand übersprungen");
    vapidBereit = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, oeffentlich, privat);
    vapidBereit = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[push] VAPID-Konfiguration ungültig – Versand übersprungen:", msg);
    vapidBereit = false;
  }
  return vapidBereit;
}

type Ziel = Pick<AboZeile, "id" | "endpoint" | "p256dh" | "auth">;

/** Ein Gerät. Entfernt das Abo, wenn der Push-Dienst es als erloschen meldet. */
export async function sendeAnGeraet(
  abo: Ziel,
  nachricht: PushNachricht,
): Promise<SendeErgebnis> {
  try {
    if (!konfiguriert()) return "nicht-konfiguriert";
    const admin = createAdminClient();
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        JSON.stringify(nachricht),
        { TTL: 24 * 60 * 60, urgency: "high", timeout: 10_000 },
      );
      const { error: updateError } = await admin
        .from("push_subscriptions")
        .update({ zuletzt_ok: new Date().toISOString() })
        .eq("id", abo.id);
      if (updateError) {
        console.error("[push] zuletzt_ok konnte nicht aktualisiert werden:", updateError.message);
      }
      return "gesendet";
    } catch (err) {
      const status = (err as { statusCode?: number } | null)?.statusCode;
      if (istAboTot(status)) {
        const { error: deleteError } = await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", abo.id);
        if (deleteError) {
          console.error("[push] abgelaufenes Abo konnte nicht gelöscht werden:", deleteError.message);
        }
        return "entfernt";
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[push] sendeAnGeraet:", msg);
      return "fehler";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[push] sendeAnGeraet:", msg);
    return "fehler";
  }
}

/** Alle passenden Geräte aller aktiven Admins. */
export async function sendeAnAdmins(art: PushArt, nachricht: PushNachricht): Promise<void> {
  try {
    if (!konfiguriert()) return;
    const { data, error } = await createAdminClient()
      .from("push_subscriptions")
      .select(
        "id, endpoint, p256dh, auth, bei_bestellung, bei_neukunde, users!inner(role, is_active)",
      );
    if (error) {
      console.error("[push] Abos konnten nicht gelesen werden:", error.message);
      return;
    }
    const empfaenger = waehleEmpfaenger((data ?? []) as unknown as AboZeile[], art);
    const results = await Promise.allSettled(empfaenger.map((abo) => sendeAnGeraet(abo, nachricht)));
    results.forEach((result) => {
      if (result.status === "rejected") {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error("[push] Versand an Gerät abgelehnt:", msg);
      }
    });
  } catch (err) {
    console.error("[push] sendeAnAdmins:", err);
  }
}

/** Nach erfolgreichem create_order aufrufen (über after()). */
export async function meldeNeueBestellung(b: {
  id: string;
  orderNumber: string;
  kunde: string | null;
}): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("orders")
      .select("total_amount")
      .eq("id", b.id)
      .maybeSingle();
    await sendeAnAdmins(
      "bestellung",
      bestellungText({
        id: b.id,
        orderNumber: b.orderNumber,
        kunde: b.kunde,
        gesamt: data?.total_amount ?? null,
      }),
    );
  } catch (err) {
    console.error("[push] meldeNeueBestellung:", err);
  }
}

/** Nach erfolgreich angelegtem Konto aufrufen (über after()). */
export async function meldeNeuenKunden(k: {
  id: string;
  firma: string | null;
  name: string | null;
  ort: string | null;
}): Promise<void> {
  try {
    await sendeAnAdmins("neukunde", neukundeText(k));
  } catch (err) {
    console.error("[push] meldeNeuenKunden:", err);
  }
}
