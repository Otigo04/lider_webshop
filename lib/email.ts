import "server-only";
import { Resend } from "resend";

/**
 * E-Mail-Versand darf nie eine bereits abgeschlossene Aktion (Bestellung,
 * Statusänderung) zum Scheitern bringen. Fehler werden hier immer nur
 * geloggt, nie geworfen – Aufrufer müssen sich um Fehlerbehandlung nicht
 * kümmern.
 */

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY fehlt – Versand übersprungen:",
      options.subject,
      "an",
      options.to,
    );
    return;
  }

  const from = process.env.EMAIL_FROM || "LIDER <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });

  if (error) {
    console.error("[email] Versand fehlgeschlagen:", options.subject, error.message);
  }
}
