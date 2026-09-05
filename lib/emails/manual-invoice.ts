import "server-only";
import type { Invoice } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { wrapEmail } from "@/lib/emails/layout";

/** Rechnungs-Mail für freie Rechnungen ohne Bestellbezug (Dienstleistung, Ware außerhalb des Katalogs). */
export function manualInvoiceEmail(invoice: Invoice): {
  subject: string;
  html: string;
} {
  const body = `
    <p style="font-size:14px;color:#374151;">
      Anbei die Rechnung <strong>${invoice.invoice_number}</strong>
      ${invoice.notes ? `zu „${invoice.notes}“` : ""}
      über ${formatPrice(invoice.total_amount)}.
    </p>
  `;

  return {
    subject: `Rechnung ${invoice.invoice_number}`,
    html: wrapEmail("Ihre Rechnung", body),
  };
}
