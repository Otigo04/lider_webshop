import "server-only";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Bestätigungsmail: der Link führt auf eine Seite mit Knopf, nicht direkt auf die Aktion. */
export function verificationEmail(
  token: string,
  hours: number,
  name?: string | null,
): { subject: string; html: string } {
  const link = siteUrl(`/bestaetigen?token=${encodeURIComponent(token)}`);
  const anrede = name ? `Guten Tag ${esc(name)},` : "Guten Tag,";
  return {
    subject: "Bitte bestätigen Sie Ihre E-Mail-Adresse",
    html: wrapEmail(
      "E-Mail-Adresse bestätigen",
      `<p style="font-size:14px;line-height:1.5;color:#374151;">${anrede}</p>
       <p style="font-size:14px;line-height:1.5;color:#374151;">
         für Sie wurde ein Konto im LIDER-Kundenportal angelegt. Bitte bestätigen Sie
         Ihre E-Mail-Adresse, damit wir es freischalten können.
       </p>
       ${buttonHtml(link, "E-Mail-Adresse bestätigen")}
       <p style="font-size:12px;color:#6b7280;margin-top:20px;">
         Der Link ist ${hours} Stunden gültig. Falls der Knopf nicht funktioniert, kopieren
         Sie diese Adresse in den Browser:<br>${link}
       </p>
       <p style="font-size:12px;color:#6b7280;">
         Wenn Sie kein Konto wollten, ignorieren Sie diese Mail einfach.
       </p>`,
    ),
  };
}

/** Zugangsdaten nach der Bestätigung (nur bei vom Admin angelegten Konten). */
export function credentialsEmail(
  email: string,
  password: string,
  name?: string | null,
): { subject: string; html: string } {
  const anrede = name ? `Guten Tag ${esc(name)},` : "Guten Tag,";
  return {
    subject: "Ihre Zugangsdaten für das LIDER-Kundenportal",
    html: wrapEmail(
      "Ihr Konto ist freigeschaltet",
      `<p style="font-size:14px;line-height:1.5;color:#374151;">${anrede}</p>
       <p style="font-size:14px;line-height:1.5;color:#374151;">
         vielen Dank für die Bestätigung. Sie können sich ab sofort anmelden:
       </p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:14px;">
         <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">E-Mail</td><td><strong>${esc(email)}</strong></td></tr>
         <tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Passwort</td><td><strong style="font-family:monospace;font-size:15px;">${esc(password)}</strong></td></tr>
       </table>
       ${buttonHtml(siteUrl("/login"), "Zur Anmeldung")}
       <p style="font-size:12px;color:#6b7280;margin-top:20px;">
         Aus Sicherheitsgründen müssen Sie das Passwort bei der ersten Anmeldung ändern.
       </p>`,
    ),
  };
}
