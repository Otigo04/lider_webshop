import "server-only";
import type { CompanySettings, Order } from "@/lib/types";
import { formatPrice, toNumber } from "@/lib/format";
import { steuer } from "@/lib/vat";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

export function invoiceEmail(
  order: Order,
  invoiceNumber: string,
  company?: CompanySettings,
): { subject: string; html: string } {
  const betraege = steuer(toNumber(order.total_amount), toNumber(order.vat_rate));
  const ueberweisung = order.payment_method === "transfer";

  const bankzeilen = [
    company?.bank_name ? `Bank: ${company.bank_name}` : null,
    company?.iban ? `IBAN: ${company.iban}` : null,
    company?.bic ? `BIC: ${company.bic}` : null,
    `Verwendungszweck: ${invoiceNumber}`,
  ].filter(Boolean);

  // Der Betrag steht brutto im Text: das ist die Zahl, die auf den
  // Überweisungsträger gehört.
  const body = `
    <p style="font-size:14px;color:#374151;">
      Anbei die Rechnung <strong>${invoiceNumber}</strong> zu Ihrer Bestellung
      ${order.order_number} über <strong>${formatPrice(betraege.brutto)}</strong>
      (${formatPrice(betraege.netto)} netto zzgl. ${betraege.satz.toFixed(0)} % USt.).
    </p>
    ${
      ueberweisung
        ? `<p style="font-size:13px;color:#6b7280;margin-top:12px;">${bankzeilen.join("<br/>")}</p>`
        : `<p style="font-size:14px;color:#374151;margin-top:12px;">Der Betrag wird bei der Abholung kassiert.</p>`
    }
    <p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}</p>
  `;

  return {
    subject: `Rechnung ${invoiceNumber}`,
    html: wrapEmail("Ihre Rechnung", body),
  };
}
