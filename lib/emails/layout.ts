import "server-only";

/** Einheitlicher Rahmen für alle Transaktionsmails: schlicht, keine Grafiken. */
export function wrapEmail(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:6px;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <span style="font-size:16px;font-weight:600;color:#1f2937;">Lider Großhandel</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">${title}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
                Diese E-Mail wurde automatisch versendet. Bei Fragen antworten Sie einfach auf diese Nachricht.
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
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

export function buttonHtml(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:8px;padding:10px 20px;background-color:#1f2937;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">${label}</a>`;
}
