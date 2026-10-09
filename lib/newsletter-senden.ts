import "server-only";
import { z } from "zod";
import { getResendClient } from "@/lib/email";
import { ladeNewsletterInhalt, baueNewsletterHtml, ABMELDE_PLATZHALTER } from "@/lib/newsletter-mail";
import { dokumentSchema } from "@/lib/newsletter";
import { abmeldeToken } from "@/lib/newsletter-token";
import { getCompanySettings } from "@/lib/queries/settings";
import { siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Newsletter an alle Abonnenten schicken – fortsetzbar.
 *
 * Ablauf: der Newsletter wird atomar von „draft“ auf „sending“ gesetzt (ein
 * zweiter Klick findet ihn nicht mehr im Entwurf), die Empfänger werden als
 * Zeilen in `newsletter_deliveries` festgehalten, das fertige HTML wandert in
 * `sent_html`. Dann geht es in Päckchen zu je 50 an Resend. Jede Zeile kennt
 * ihr Ergebnis; ein abgebrochener Versand (Zeitlimit, Absturz) macht dort
 * weiter, wo er aufhörte, und keiner bekommt die Mail zweimal.
 *
 * Empfänger: aktive Kundenkonten mit Abo. Der Abmeldelink ist je Empfänger
 * signiert und steht auch als List-Unsubscribe-Kopfzeile in der Mail
 * (Ein-Klick-Abmeldung der Mailprogramme).
 */

const PAECKCHEN = 50;
/** Das Zeitlimit einer Function liegt bei 300 s; davor wird sauber aufgehört. */
const ZEITBUDGET_MS = 240_000;
const PAUSE_MS = 700;

export type VersandErgebnis =
  | { ok: true; gesendet: number; fehlgeschlagen: number; offen: number }
  | { ok: false; error: string };

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function abmeldeLink(userId: string, art: "seite" | "eintrag"): string {
  const t = encodeURIComponent(abmeldeToken(userId));
  const pfad = art === "seite" ? "/newsletter/abmelden" : "/newsletter/abmelden/eintrag";
  return `${siteUrl()}${pfad}?u=${userId}&t=${t}`;
}

export async function versendeNewsletter(
  newsletterId: string,
  opts: { fehlerWiederholen?: boolean } = {},
): Promise<VersandErgebnis> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY fehlt – es kann nichts verschickt werden." };
  }
  const db = createAdminClient();
  const start = Date.now();

  const { data: nl, error } = await db
    .from("newsletters")
    .select("id, subject, preheader, blocks, status, sent_html")
    .eq("id", newsletterId)
    .maybeSingle();
  if (error || !nl) return { ok: false, error: "Newsletter nicht gefunden." };
  if (nl.status === "sent" && !opts.fehlerWiederholen) {
    return { ok: false, error: "Dieser Newsletter ist schon verschickt." };
  }
  if (nl.status === "draft" && opts.fehlerWiederholen) {
    return { ok: false, error: "Dieser Newsletter wurde noch nicht verschickt." };
  }

  // Fehlgeschlagene Zustellungen (Netz, Domain noch nicht freigegeben …) noch
  // einmal versuchen; die erfolgreichen bleiben unberührt.
  if (opts.fehlerWiederholen) {
    await db
      .from("newsletter_deliveries")
      .update({ status: "pending", error: null })
      .eq("newsletter_id", newsletterId)
      .eq("status", "failed");
    await db.from("newsletters").update({ status: "sending" }).eq("id", newsletterId);
  }

  let html = nl.sent_html as string | null;

  if (nl.status === "draft") {
    const dok = dokumentSchema.safeParse({
      betreff: nl.subject,
      vorschautext: nl.preheader ?? "",
      blocks: nl.blocks,
    });
    if (!dok.success) return { ok: false, error: dok.error.issues[0].message };

    const [firma, inhalt] = await Promise.all([
      getCompanySettings(),
      ladeNewsletterInhalt(db, dok.data.blocks),
    ]);
    html = baueNewsletterHtml({
      dokument: dok.data,
      inhalt,
      firma,
      abmeldeUrl: ABMELDE_PLATZHALTER,
    });

    // Atomar: nur wer den Entwurf auf „sending“ setzt, darf Empfänger anlegen.
    const { data: gesperrt } = await db
      .from("newsletters")
      .update({ status: "sending", sent_html: html })
      .eq("id", newsletterId)
      .eq("status", "draft")
      .select("id");
    if (!gesperrt?.length) return { ok: false, error: "Der Versand läuft bereits." };

    const { data: abonnenten, error: fehlerAbo } = await db
      .from("users")
      .select("id, email")
      .eq("role", "customer")
      .eq("is_active", true)
      .eq("newsletter_abo", true);
    if (fehlerAbo) {
      await db.from("newsletters").update({ status: "draft", sent_html: null }).eq("id", newsletterId);
      return { ok: false, error: "Die Abonnenten konnten nicht geladen werden." };
    }
    if (!abonnenten?.length) {
      await db.from("newsletters").update({ status: "draft", sent_html: null }).eq("id", newsletterId);
      return { ok: false, error: "Es gibt keine Abonnenten." };
    }
    for (let i = 0; i < abonnenten.length; i += 500) {
      await db.from("newsletter_deliveries").upsert(
        abonnenten.slice(i, i + 500).map((a) => ({
          newsletter_id: newsletterId,
          user_id: a.id,
          email: a.email,
          status: "pending",
        })),
        { onConflict: "newsletter_id,email", ignoreDuplicates: true },
      );
    }
  }
  if (!html) return { ok: false, error: "Das Dokument fehlt – bitte Entwurf neu öffnen." };

  const from = process.env.EMAIL_FROM || "LIDER <onboarding@resend.dev>";

  for (;;) {
    if (Date.now() - start > ZEITBUDGET_MS) break;

    const { data: offen } = await db
      .from("newsletter_deliveries")
      .select("id, user_id, email")
      .eq("newsletter_id", newsletterId)
      .eq("status", "pending")
      .limit(PAECKCHEN);
    if (!offen?.length) break;

    const mails = offen.map((z) => {
      const einmal = abmeldeLink(z.user_id as string, "eintrag");
      return {
        from,
        to: z.email as string,
        subject: nl.subject as string,
        html: html!.replaceAll(ABMELDE_PLATZHALTER, abmeldeLink(z.user_id as string, "seite")),
        headers: {
          "List-Unsubscribe": `<${einmal}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    const { error: sendeFehler } = await resend.batch.send(mails);
    const ids = offen.map((z) => z.id as string);
    if (sendeFehler) {
      console.error("[newsletter] Päckchen:", sendeFehler.message);
      await db
        .from("newsletter_deliveries")
        .update({ status: "failed", error: sendeFehler.message.slice(0, 300) })
        .in("id", ids);
    } else {
      await db
        .from("newsletter_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .in("id", ids);
    }
    await warte(PAUSE_MS);
  }

  const zaehle = async (status: string) => {
    const { count } = await db
      .from("newsletter_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("newsletter_id", newsletterId)
      .eq("status", status);
    return count ?? 0;
  };
  const [gesendet, fehlgeschlagen, offen] = await Promise.all([
    zaehle("sent"),
    zaehle("failed"),
    zaehle("pending"),
  ]);

  // „Verschickt“ erst, wenn wirklich etwas rausging; sind alle Zustellungen
  // gescheitert, bleibt der Newsletter im Versand und lässt sich wiederholen.
  if (offen === 0 && gesendet > 0) {
    await db
      .from("newsletters")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", newsletterId);
  }
  return { ok: true, gesendet, fehlgeschlagen, offen };
}


// --- Einzelversand -----------------------------------------------------------

export type EinzelErgebnis =
  | { ok: true; gesendet: number; bereitsErhalten: number; ungueltig: string[] }
  | { ok: false; error: string };

const EINZEL_MAX = 200;
const emailPruefung = z.string().email();

/**
 * Den Newsletter an ausgewählte Kunden und/oder einzelne Adressen schicken,
 * unabhängig vom Abo und ohne den Status des Newsletters zu ändern.
 *
 * Kunden bekommen ihren persönlichen Abmeldelink; Adressen ohne Konto eine
 * Fußzeile „persönlich zugeschickt“. Wer den Newsletter schon erhalten hat
 * (Zeile `sent` in newsletter_deliveries), bekommt ihn nicht noch einmal – das
 * gilt auch für den späteren Versand an alle Abonnenten: wer ihn schon hat,
 * wird dort übersprungen.
 *
 * Marketing an Nicht-Abonnenten ist nur mit Einwilligung oder bei
 * persönlichem Anlass zulässig; das entscheidet der Admin, die Oberfläche
 * weist darauf hin.
 */
export async function versendeEinzeln(
  newsletterId: string,
  ziel: { userIds: string[]; emails: string[] },
): Promise<EinzelErgebnis> {
  const resend = getResendClient();
  if (!resend) return { ok: false, error: "RESEND_API_KEY fehlt – es kann nichts verschickt werden." };
  const db = createAdminClient();

  const { data: nl } = await db
    .from("newsletters")
    .select("id, subject, preheader, blocks, sent_html")
    .eq("id", newsletterId)
    .maybeSingle();
  if (!nl) return { ok: false, error: "Newsletter nicht gefunden." };

  // Empfänger sammeln: Kunden (mit Konto) und freie Adressen, je Adresse einmal.
  const empfaenger = new Map<string, { userId: string | null; email: string }>();
  if (ziel.userIds.length > 0) {
    const { data: kunden } = await db
      .from("users")
      .select("id, email")
      .eq("role", "customer")
      .eq("is_active", true)
      .in("id", ziel.userIds);
    for (const k of kunden ?? []) {
      empfaenger.set((k.email as string).toLowerCase(), { userId: k.id as string, email: k.email as string });
    }
  }
  const ungueltig: string[] = [];
  for (const roh of ziel.emails) {
    const email = roh.trim();
    if (!email) continue;
    if (!emailPruefung.safeParse(email).success) {
      ungueltig.push(email);
      continue;
    }
    if (!empfaenger.has(email.toLowerCase())) {
      empfaenger.set(email.toLowerCase(), { userId: null, email });
    }
  }
  if (empfaenger.size === 0) {
    return { ok: false, error: ungueltig.length > 0 ? `Keine gültige Adresse: ${ungueltig.join(", ")}` : "Es sind keine Empfänger ausgewählt." };
  }
  if (empfaenger.size > EINZEL_MAX) {
    return { ok: false, error: `Höchstens ${EINZEL_MAX} Empfänger auf einmal. Für alle Abonnenten gibt es „Senden“.` };
  }

  // Schon erhalten?
  const adressen = [...empfaenger.values()].map((e) => e.email);
  const { data: vorhanden } = await db
    .from("newsletter_deliveries")
    .select("email, status")
    .eq("newsletter_id", newsletterId)
    .in("email", adressen);
  const erhalten = new Set(
    (vorhanden ?? []).filter((z) => z.status === "sent").map((z) => (z.email as string).toLowerCase()),
  );
  const offen = [...empfaenger.entries()].filter(([schluessel]) => !erhalten.has(schluessel)).map(([, e]) => e);
  if (offen.length === 0) {
    return { ok: true, gesendet: 0, bereitsErhalten: erhalten.size, ungueltig };
  }

  // Inhalt: verschickte Newsletter behalten ihren festgehaltenen Stand.
  let mitAbmelden: string;
  let persoenlich: string;
  if (nl.sent_html) {
    mitAbmelden = nl.sent_html as string;
    persoenlich = mitAbmelden;
  } else {
    const dok = dokumentSchema.safeParse({
      betreff: nl.subject,
      vorschautext: nl.preheader ?? "",
      blocks: nl.blocks,
    });
    if (!dok.success) return { ok: false, error: dok.error.issues[0].message };
    const [firma, inhalt] = await Promise.all([
      getCompanySettings(),
      ladeNewsletterInhalt(db, dok.data.blocks),
    ]);
    mitAbmelden = baueNewsletterHtml({ dokument: dok.data, inhalt, firma, abmeldeUrl: ABMELDE_PLATZHALTER });
    persoenlich = baueNewsletterHtml({ dokument: dok.data, inhalt, firma, abmeldeUrl: null });
  }

  await db.from("newsletter_deliveries").upsert(
    offen.map((e) => ({
      newsletter_id: newsletterId,
      user_id: e.userId,
      email: e.email,
      status: "pending",
      error: null,
    })),
    { onConflict: "newsletter_id,email" },
  );

  const from = process.env.EMAIL_FROM || "LIDER <onboarding@resend.dev>";
  let gesendet = 0;
  for (let i = 0; i < offen.length; i += PAECKCHEN) {
    const teil = offen.slice(i, i + PAECKCHEN);
    const mails = teil.map((e) => ({
      from,
      to: e.email,
      subject: nl.subject as string,
      html: e.userId
        ? mitAbmelden.replaceAll(ABMELDE_PLATZHALTER, abmeldeLink(e.userId, "seite"))
        : persoenlich,
      ...(e.userId
        ? {
            headers: {
              "List-Unsubscribe": `<${abmeldeLink(e.userId, "eintrag")}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    }));
    const { error } = await resend.batch.send(mails);
    const adr = teil.map((e) => e.email);
    if (error) {
      await db
        .from("newsletter_deliveries")
        .update({ status: "failed", error: error.message.slice(0, 300) })
        .eq("newsletter_id", newsletterId)
        .in("email", adr);
      return { ok: false, error: `Der Versand ist fehlgeschlagen: ${error.message}` };
    }
    await db
      .from("newsletter_deliveries")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("newsletter_id", newsletterId)
      .in("email", adr);
    gesendet += teil.length;
    if (i + PAECKCHEN < offen.length) await warte(PAUSE_MS);
  }
  return { ok: true, gesendet, bereitsErhalten: erhalten.size, ungueltig };
}
