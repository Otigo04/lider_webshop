import "server-only";
import {
  absatz,
  buttonHtml,
  esc,
  feld,
  kasten,
  kleingedrucktes,
  siteUrl,
  wrapEmail,
} from "@/lib/emails/layout";
import { angebotBedingung, angebotTitel, type NewsletterAngebot } from "@/lib/newsletter-angebot";

/**
 * Mail an einen neuen Abonnenten mit dem Willkommensgutschein (Migration 076).
 * Eine Mail zum Abo, kein Newsletter: kein Abmeldelink nötig, sie geht genau
 * einmal je Konto raus.
 */
export function newsletterGutscheinEmail(
  code: string,
  angebot: NewsletterAngebot,
  name?: string | null,
): { subject: string; html: string } {
  const bedingung = angebotBedingung(angebot);
  return {
    subject: `Ihr Gutschein: ${angebotTitel(angebot)}`,
    html: wrapEmail(
      "Willkommen im LIDER-Newsletter",
      `${absatz(name ? `Guten Tag ${esc(name)},` : "Guten Tag,")}
       ${absatz(
         "vielen Dank für Ihre Anmeldung. Als Dankeschön schenken wir Ihnen einen Gutschein.",
       )}
       ${kasten(
         `${feld("Ihr Gutscheincode", `<strong style="letter-spacing:1px;font-size:20px;">${esc(code)}</strong>`)}
          ${feld("Das bekommen Sie", esc(angebotTitel(angebot)))}`,
       )}
       ${absatz(
         `Geben Sie den Code im Warenkorb beim Bestellen ein.${
           bedingung ? ` Er gilt ${esc(bedingung)}.` : ""
         }${angebot.nur_erstbestellung ? " Einlösbar einmal, auf Ihre erste Bestellung." : ""}`,
       )}
       ${buttonHtml(siteUrl("/shop"), "Zum Sortiment")}
       ${kleingedrucktes(
         "Sie können den Newsletter jederzeit in Ihrem Konto oder über den Link in jeder Newsletter-Mail abbestellen.",
       )}`,
      { preheader: `Ihr Code ${code} – ${angebotTitel(angebot)}.` },
    ),
  };
}
