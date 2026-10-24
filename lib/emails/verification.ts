import "server-only";
import {
  absatz,
  buttonHtml,
  esc,
  feld,
  kasten,
  kleingedrucktes,
  schritte,
  siteUrl,
  wrapEmail,
} from "@/lib/emails/layout";

function anredeVon(name?: string | null): string {
  return name ? `Guten Tag ${esc(name)},` : "Guten Tag,";
}

/** Bestätigungsmail: der Link führt auf eine Seite mit Knopf, nicht direkt auf die Aktion. */
export function verificationEmail(
  token: string,
  hours: number,
  name?: string | null,
): { subject: string; html: string } {
  const link = siteUrl(`/bestaetigen?token=${encodeURIComponent(token)}`);
  return {
    subject: "Bitte bestätigen Sie Ihre E-Mail-Adresse",
    html: wrapEmail(
      "Ein Klick, dann sind Sie dabei",
      `${absatz(anredeVon(name))}
       ${absatz(
         "für Sie wurde ein Konto im LIDER-Kundenportal angelegt. Bitte bestätigen Sie Ihre E-Mail-Adresse, damit wir es freischalten können.",
       )}
       ${buttonHtml(link, "E-Mail-Adresse bestätigen")}
       ${kleingedrucktes(
         `Der Link ist ${hours} Stunden gültig. Falls der Knopf nicht funktioniert, kopieren Sie diese Adresse in den Browser:<br>${link}`,
       )}
       ${kleingedrucktes("Wenn Sie kein Konto wollten, ignorieren Sie diese Mail einfach.")}`,
      { preheader: "Bestätigen Sie Ihre Adresse, dann schalten wir Ihr Konto frei."},
    ),
  };
}

type ZugangsVariante = "willkommen" | "freigeschaltet" | "neu";

const ZUGANG_TEXTE: Record<
  ZugangsVariante,
  { subject: string; titel: string; einleitung: string; preheader: string}
> = {
  // Gleich beim Anlegen durch den Admin.
  willkommen: {
    subject: "Willkommen bei LIDER – Ihre Zugangsdaten",
    titel: "Willkommen bei LIDER",
    einleitung:
      "wir haben für Sie ein Konto im LIDER-Kundenportal eingerichtet. Hier sehen Sie Preise und Verfügbarkeit und bestellen direkt – rund um die Uhr.",
    preheader: "Ihr Konto ist bereit – hier sind Ihre Zugangsdaten.",
  },
  // Nach der Bestätigung eines älteren, gesperrt angelegten Kontos.
  freigeschaltet: {
    subject: "Ihre Zugangsdaten für das LIDER-Kundenportal",
    titel: "Ihr Konto ist freigeschaltet",
    einleitung:
      "vielen Dank für die Bestätigung. Ihr Konto ist freigeschaltet, Sie können sich ab sofort anmelden.",
    preheader: "Ihre Zugangsdaten für das Kundenportal.",
  },
  // Admin hat ein neues Startpasswort vergeben.
  neu: {
    subject: "Ihr neues Einmalpasswort für das LIDER-Kundenportal",
    titel: "Ihr neues Einmalpasswort",
    einleitung:
      "für Ihr Konto im LIDER-Kundenportal wurde ein neues Einmalpasswort vergeben. Das bisherige Passwort gilt nicht mehr.",
    preheader: "Mit diesem Einmalpasswort können Sie sich wieder anmelden.",
  },
};

function zugangsdatenMail(
  email: string,
  password: string,
  name: string | null | undefined,
  variante: ZugangsVariante,
): { subject: string; html: string } {
  const t = ZUGANG_TEXTE[variante];
  const einleitung = t.einleitung;

  return {
    subject: t.subject,
    html: wrapEmail(
      t.titel,
      `${absatz(anredeVon(name))}
       ${absatz(einleitung)}
       ${kasten(
         `${feld("Anmeldename (E-Mail)", esc(email))}
          ${feld(
            "Einmalpasswort",
            `<span style="font-family:'Courier New',Courier,monospace;font-size:19px;font-weight:700;letter-spacing:.04em;color:#131f3a;">${esc(password)}</span>`,
          )}`,
       )}
       ${buttonHtml(siteUrl("/login"), "Jetzt anmelden")}
       <p style="margin:20px 0 6px;font-size:14px;font-weight:700;color:#131f3a;">So geht es weiter</p>
       ${schritte([
         "Mit E-Mail und Einmalpasswort anmelden.",
         "Eigenes Passwort festlegen – das Einmalpasswort gilt nur für die erste Anmeldung.",
         "Profil vervollständigen und Artikel bestellen.",
       ])}
       ${kleingedrucktes(
         "Bitte geben Sie das Passwort nicht weiter und löschen Sie diese Mail nach der ersten Anmeldung. Das Passwort besteht aus Buchstaben und Ziffern; verwechselbare Zeichen wie 0/O oder 1/l kommen darin nicht vor.",
       )}`,
      { preheader: t.preheader},
    ),
  };
}

/** Beim Anlegen durch den Admin: sofort, mit Einmalpasswort. */
export function welcomeEmail(
  email: string,
  password: string,
  name?: string | null,
): { subject: string; html: string } {
  return zugangsdatenMail(email, password, name, "willkommen");
}

/** Zugangsdaten nach der Bestätigung (Altbestand: gesperrt angelegte Admin-Konten). */
export function credentialsEmail(
  email: string,
  password: string,
  name?: string | null,
): { subject: string; html: string } {
  return zugangsdatenMail(email, password, name, "freigeschaltet");
}

/** Admin hat ein neues Startpasswort gesetzt (Kunde ausgesperrt, Passwort vergessen). */
export function newPasswordEmail(
  email: string,
  password: string,
  name?: string | null,
): { subject: string; html: string } {
  return zugangsdatenMail(email, password, name, "neu");
}
