/**
 * Absender und Antwortadresse aller Mails (Transaktionsmails, Rechnung,
 * Newsletter) an einer Stelle.
 *
 * Gesendet wird von einer Adresse, die niemand liest (noreply@); damit Kunden
 * trotzdem jemanden erreichen, steht in jeder Mail die Antwortadresse im
 * Text, und jede Mail trägt sie als Reply-To. Ohne Reply-To liefe „Antworten"
 * ins Leere.
 *
 * Bewusst ohne `server-only`: die Fußzeile der Mailvorlagen braucht die
 * Adresse, und die Vorlagen werden auch in Tests ohne Next geladen.
 */

/** Hierhin gehen Fragen und Antworten auf Mails. */
export const ANTWORT_ADRESSE = "o.tas@lider-berlin.de";

/**
 * Absender, wenn `EMAIL_FROM` nicht gesetzt ist. Die Domain ist bei Resend
 * verifiziert, jede Adresse darauf darf senden.
 */
export const ABSENDER_STANDARD = "LIDER <noreply@lider-berlin.de>";

/** `EMAIL_FROM` aus der Umgebung, sonst der Standardabsender. Leer zählt als nicht gesetzt. */
export function absender(): string {
  return process.env.EMAIL_FROM?.trim() || ABSENDER_STANDARD;
}
