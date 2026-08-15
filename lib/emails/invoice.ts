import "server-only";
import type { Order } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

export function invoiceEmail(
  order: Order,
  invoiceNumber: string,
): { subject: string; html: string } {
  const body = `
    <p style="font-size:14px;color:#374151;">
      Anbei die Rechnung <strong>${invoiceNumber}</strong> zu Ihrer Bestellung ${order.order_number}
      über ${formatPrice(order.total_amount)} netto.
    </p>
    <p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}</p>
  `;

  return {
    subject: `Rechnung ${invoiceNumber}`,
    html: wrapEmail("Ihre Rechnung", body),
  };
}
