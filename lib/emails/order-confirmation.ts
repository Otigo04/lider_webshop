import "server-only";
import type { Order } from "@/lib/types";
import { formatPrice, formatQuantity } from "@/lib/format";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

export function orderConfirmationEmail(order: Order): { subject: string; html: string } {
  const items = order.items ?? [];

  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;">${item.product_name}<br/><span style="color:#6b7280;font-size:12px;">${item.product_sku}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right;">${formatQuantity(item.quantity)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right;">${formatPrice(item.subtotal)}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <p style="font-size:14px;color:#374151;">Ihre Bestellung <strong>${order.order_number}</strong> ist bei uns eingegangen und wird bearbeitet.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      <thead>
        <tr>
          <th style="text-align:left;font-size:12px;color:#6b7280;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">Artikel</th>
          <th style="text-align:right;font-size:12px;color:#6b7280;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">Menge</th>
          <th style="text-align:right;font-size:12px;color:#6b7280;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">Summe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;font-size:14px;font-weight:600;margin-top:12px;">Gesamt netto: ${formatPrice(order.total_amount)}</p>
    <p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}</p>
  `;

  return {
    subject: `Bestellbestätigung ${order.order_number}`,
    html: wrapEmail("Bestellbestätigung", body),
  };
}
