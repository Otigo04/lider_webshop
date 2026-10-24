import "server-only";
import { absatz, buttonHtml, kasten, kleingedrucktes, siteUrl, wrapEmail } from "@/lib/emails/layout";

/**
 * Mail zum Zurücksetzen des Passworts. Der Link führt auf eine Seite mit
 * Knopf (/passwort-zuruecksetzen), nicht direkt auf die Aktion: Mail-Programme
 * und Virenscanner rufen Links vorab per GET ab und würden das Einmal-Token
 * sonst verbrauchen, bevor der Kunde klickt.
 */
export function passwordResetEmail(tokenHash: string): { subject: string; html: string } {
  const link = siteUrl(`/passwort-zuruecksetzen?token_hash=${encodeURIComponent(tokenHash)}`);
  return {
    subject: "Passwort zurücksetzen",
    html: wrapEmail(
      "Neues Passwort vergeben",
      `${absatz("Guten Tag,")}
       ${absatz("für Ihr Konto im LIDER-Kundenportal wurde ein neues Passwort angefordert.")}
       ${buttonHtml(link, "Neues Passwort vergeben")}
       ${kasten(
         `<span style="font-size:13px;line-height:1.5;color:#374151;">Der Link ist <strong>eine Stunde</strong> gültig und nur einmal benutzbar.</span>`,
       )}
       ${kleingedrucktes(
         `Falls der Knopf nicht funktioniert, kopieren Sie diese Adresse in den Browser:<br>${link}`,
       )}
       ${kleingedrucktes(
         "Wenn Sie das nicht angefordert haben, ignorieren Sie diese Mail. Ihr Passwort bleibt dann unverändert.",
       )}`,
      { preheader: "Der Link zum Neuvergeben Ihres Passworts ist eine Stunde gültig."},
    ),
  };
}
