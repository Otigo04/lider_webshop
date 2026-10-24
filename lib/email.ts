import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import { LOGO_CID } from "@/lib/emails/layout";

/**
 * E-Mail-Versand darf nie eine bereits abgeschlossene Aktion (Bestellung,
 * Statusänderung) zum Scheitern bringen. Fehler werden hier immer nur
 * geloggt, nie geworfen – Aufrufer müssen sich um Fehlerbehandlung nicht
 * kümmern.
 */

let client: Resend | null = null;

/** Für den Newsletter-Versand (Batch-Aufruf mit eigenen Kopfzeilen). */
export function getResendClient(): Resend | null {
  return getClient();
}

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentId?: string }[];
}

/** `true` = Resend hat die Mail angenommen; `false` = übersprungen oder fehlgeschlagen. */
/**
 * Logo für Mails, die `cid:lider-logo` verwenden. Druckfassung (weißer Grund,
 * 600 px): auf dem weißen Briefblatt sauber, und klein genug für den Anhang.
 */
function logoAnhang(html: string): { filename: string; content: Buffer; contentId: string }[] {
  if (!html.includes(`cid:${LOGO_CID}`)) return [];
  try {
    const datei = path.join(process.cwd(), "public", "logo", "logo-print.png");
    return [{ filename: "lider-logo.png", content: readFileSync(datei), contentId: LOGO_CID }];
  } catch {
    return [];
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY fehlt – Versand übersprungen:",
      options.subject,
      "an",
      options.to,
    );
    return false;
  }

  const from = process.env.EMAIL_FROM || "LIDER <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: [...(options.attachments ?? []), ...logoAnhang(options.html)],
  });

  if (error) {
    console.error("[email] Versand fehlgeschlagen:", options.subject, error.message);
    return false;
  }
  return true;
}
