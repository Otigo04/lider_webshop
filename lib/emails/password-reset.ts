import "server-only";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

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
      "Passwort zurücksetzen",
      `<p style="font-size:14px;line-height:1.5;color:#374151;">Guten Tag,</p>
       <p style="font-size:14px;line-height:1.5;color:#374151;">
         für Ihr Konto im LIDER-Kundenportal wurde ein neues Passwort angefordert.
       </p>
       ${buttonHtml(link, "Neues Passwort vergeben")}
       <p style="font-size:12px;color:#6b7280;margin-top:20px;">
         Der Link ist eine Stunde gültig und nur einmal benutzbar. Falls der Knopf nicht
         funktioniert, kopieren Sie diese Adresse in den Browser:<br>${link}
       </p>
       <p style="font-size:12px;color:#6b7280;">
         Wenn Sie das nicht angefordert haben, ignorieren Sie diese Mail. Ihr Passwort
         bleibt dann unverändert.
       </p>`,
    ),
  };
}
