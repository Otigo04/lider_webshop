import "server-only";
import { formatPrice } from "@/lib/format";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

/** Mail zur Stornorechnung – mit dem PDF im Anhang. */
export function stornoEmail(opts: {
  originalNummer: string;
  stornoNummer: string;
  brutto: number;
  grund: string | null;
  orderId: string | null;
}): { subject: string; html: string } {
  const body = `
    <p style="font-size:14px;color:#374151;">
      Wir haben die Rechnung <strong>${opts.originalNummer}</strong> storniert.
      Anbei die Stornorechnung <strong>${opts.stornoNummer}</strong>
      über ${formatPrice(-Math.abs(opts.brutto))}.
    </p>
    ${
      opts.grund
        ? `<p style="font-size:14px;color:#374151;">Grund: ${opts.grund
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</p>`
        : ""
    }
    <p style="font-size:14px;color:#374151;">
      Bereits gezahlte Beträge erstatten wir bzw. verrechnen sie mit offenen
      Forderungen. Bei Fragen melden Sie sich gerne bei uns.
    </p>
    ${
      opts.orderId
        ? `<p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${opts.orderId}`), "Bestellung ansehen")}</p>`
        : ""
    }
  `;

  return {
    subject: `Stornorechnung ${opts.stornoNummer} zu Rechnung ${opts.originalNummer}`,
    html: wrapEmail("Stornorechnung", body),
  };
}
