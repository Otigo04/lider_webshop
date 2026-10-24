import "server-only";
import { siteUrl as basisUrl } from "@/lib/site";

/*
 * Rahmen aller Transaktionsmails. Dieselben Farben und derselbe Aufbau wie der
 * Newsletter (lib/newsletter-mail.ts): Wappenblau oben, Logo, Goldlinie,
 * weißes Blatt, grauer Fuß. Tabellen und Inline-Stile, weil Outlook kein
 * modernes CSS liest. Ohne geladene Bilder (viele Programme sperren sie) bleibt
 * der Schriftzug als Alt-Text stehen – die Mail ist auch ohne Logo lesbar.
 */

const BLAU = "#284078";
const NAVY = "#131f3a";
const GRAU = "#5b6472";
const LINIE = "#d9dce1";

/** Logo wird als Anhang eingebettet (lib/email.ts), nicht von der Website geladen. */
export const LOGO_CID = "lider-logo";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface WrapOptions {
  /** Vorschautext neben dem Betreff in der Postfachliste. */
  preheader?: string;
}

/*
 * Rahmen aller Transaktionsmails: weißes Blatt, Logo links oben, Linie, Text,
 * schlichter Fuß – wie ein Geschäftsbrief, keine Effekte. Tabellen und
 * Inline-Stile, weil Outlook kein modernes CSS liest. Das Logo hängt als
 * eingebettetes Bild (cid:) an der Mail: Es erscheint auch ohne öffentlich
 * erreichbare Domain und lässt sich nicht von der Bildersperre erwischen,
 * die Fremdbilder blockt.
 */
export function wrapEmail(title: string, bodyHtml: string, opts: WrapOptions = {}): string {
  const basis = basisUrl();
  const vorschau = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f2f4;font-family:Arial,Helvetica,sans-serif;color:#111827;">
${vorschau}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f2f4;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${LINIE};">
        <tr>
          <td style="padding:24px 32px 20px;border-bottom:1px solid ${LINIE};">
            <a href="${basis}" style="text-decoration:none;"><img src="cid:${LOGO_CID}" width="110" alt="LIDER" style="display:block;border:0;height:auto;font-size:22px;font-weight:700;color:#a02020;"></a>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 26px;">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;color:${NAVY};">${title}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 20px;border-top:1px solid ${LINIE};font-size:12px;line-height:1.7;color:${GRAU};">
            LIDER · Groß- und Einzelhandel<br>
            Fragen? Antworten Sie einfach auf diese Nachricht.<br>
            <a href="${basis}/impressum" style="color:${GRAU};">Impressum</a> ·
            <a href="${basis}/datenschutz" style="color:${GRAU};">Datenschutz</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function siteUrl(path: string): string {
  return `${basisUrl()}${path}`;
}

/** Fließtext-Absatz im einheitlichen Schriftbild. */
export function absatz(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">${html}</p>`;
}

/** Kleingedrucktes unter dem Hauptinhalt. */
export function kleingedrucktes(html: string): string {
  return `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${GRAU};">${html}</p>`;
}

/** Hauptknopf, Wappenblau, schlicht. */
export function buttonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="background-color:${BLAU};border-radius:3px;"><a href="${href}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${label}</a></td></tr></table>`;
}

/** Eingerahmter Block für Zugangsdaten und Hinweise. */
export function kasten(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="padding:14px 18px;border:1px solid ${LINIE};background-color:#fafafa;">${innerHtml}</td></tr></table>`;
}

/** Beschriftung + Wert untereinander, für Kästen. */
export function feld(label: string, wertHtml: string): string {
  return `<div style="margin:0 0 10px;"><div style="font-size:12px;color:${GRAU};">${label}</div><div style="margin-top:2px;font-size:16px;color:${NAVY};">${wertHtml}</div></div>`;
}

/** Schritte als einfache nummerierte Liste. */
export function schritte(liste: string[]): string {
  const punkte = liste
    .map((text) => `<li style="margin:0 0 6px;padding-left:2px;">${text}</li>`)
    .join("");
  return `<ol style="margin:4px 0 4px 20px;padding:0;font-size:14px;line-height:1.5;color:#374151;">${punkte}</ol>`;
}
