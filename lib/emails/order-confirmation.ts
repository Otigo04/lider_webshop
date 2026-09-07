import "server-only";
import type { CompanySettings, Order } from "@/lib/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/types";
import { formatDateTime, formatPrice, formatQuantity, toNumber } from "@/lib/format";
import { steuer } from "@/lib/vat";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

const ZELLE = "padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;";
const KOPF =
  "font-size:12px;color:#6b7280;padding-bottom:8px;border-bottom:1px solid #e5e7eb;";

/**
 * Bestellbestätigung. Sie muss zwei Fragen beantworten, ohne dass der Kunde
 * sich einloggen muss: Was habe ich bestellt, und was ist jetzt zu tun. Der
 * Betrag steht deshalb brutto da – überwiesen wird der Endbetrag, nicht der
 * Nettowert.
 */
export function orderConfirmationEmail(
  order: Order,
  company?: CompanySettings,
): { subject: string; html: string } {
  const items = order.items ?? [];
  const betraege = steuer(toNumber(order.total_amount), toNumber(order.vat_rate));

  const rows = items
    .map(
      (item) => `<tr>
        <td style="${ZELLE}">${item.product_name}<br/><span style="color:#6b7280;font-size:12px;">${item.product_sku}</span></td>
        <td style="${ZELLE}text-align:right;">${formatQuantity(item.quantity)}</td>
        <td style="${ZELLE}text-align:right;">${formatPrice(item.subtotal)}</td>
      </tr>`,
    )
    .join("");

  const bankzeilen = [
    company?.bank_name ? `Bank: ${company.bank_name}` : null,
    company?.iban ? `IBAN: ${company.iban}` : null,
    company?.bic ? `BIC: ${company.bic}` : null,
  ].filter(Boolean);

  const zahlung =
    order.payment_method === "transfer"
      ? `<p style="font-size:14px;color:#374151;margin-top:20px;">
           Bitte überweisen Sie <strong>${formatPrice(betraege.brutto)}</strong>.
           Die Rechnung mit allen Angaben folgt in einer eigenen E-Mail; wir
           beginnen mit der Bearbeitung, sobald die Zahlung bei uns eingegangen ist.
         </p>
         ${
           bankzeilen.length > 0
             ? `<p style="font-size:13px;color:#6b7280;margin-top:8px;">${bankzeilen.join("<br/>")}</p>`
             : ""
         }`
      : `<p style="font-size:14px;color:#374151;margin-top:20px;">
           Sie zahlen <strong>${PAYMENT_METHOD_LABELS[order.payment_method].toLowerCase()}</strong>.
           Vorab ist nichts zu tun – wir melden uns, sobald die Ware bereitsteht.
         </p>`;

  const abholung =
    order.delivery_method === "pickup" && order.pickup_at
      ? `<p style="font-size:14px;color:#374151;margin-top:12px;">
           Ihr Wunschtermin zur Abholung: <strong>${formatDateTime(order.pickup_at)}</strong>.
           Wir bestätigen ihn, sobald die Ware kommissioniert ist.
         </p>`
      : "";

  const body = `
    <p style="font-size:14px;color:#374151;">Ihre Bestellung <strong>${order.order_number}</strong> ist bei uns eingegangen.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      <thead>
        <tr>
          <th style="text-align:left;${KOPF}">Artikel</th>
          <th style="text-align:right;${KOPF}">Menge</th>
          <th style="text-align:right;${KOPF}">Summe netto</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="font-size:13px;color:#6b7280;text-align:right;padding:2px 0;">Summe netto</td>
        <td style="font-size:13px;color:#374151;text-align:right;padding:2px 0;width:120px;">${formatPrice(betraege.netto)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;text-align:right;padding:2px 0;">zzgl. ${betraege.satz.toFixed(0)} % USt.</td>
        <td style="font-size:13px;color:#374151;text-align:right;padding:2px 0;">${formatPrice(betraege.steuer)}</td>
      </tr>
      <tr>
        <td style="font-size:15px;font-weight:600;color:#111827;text-align:right;padding:8px 0 0;border-top:1px solid #e5e7eb;">Gesamtbetrag</td>
        <td style="font-size:15px;font-weight:600;color:#111827;text-align:right;padding:8px 0 0;border-top:1px solid #e5e7eb;">${formatPrice(betraege.brutto)}</td>
      </tr>
    </table>
    ${zahlung}
    ${abholung}
    <p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}</p>
  `;

  return {
    subject: `Bestellbestätigung ${order.order_number}`,
    html: wrapEmail("Bestellbestätigung", body),
  };
}
