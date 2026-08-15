import "server-only";
import type { Order, OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

export function orderStatusChangedEmail(
  order: Order,
  status: OrderStatus,
): { subject: string; html: string } {
  const label = ORDER_STATUS_LABELS[status];

  const body = `
    <p style="font-size:14px;color:#374151;">
      Der Status Ihrer Bestellung <strong>${order.order_number}</strong> hat sich geändert:
    </p>
    <p style="margin:16px 0;font-size:16px;font-weight:600;color:#111827;">${label}</p>
    <p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}</p>
  `;

  return {
    subject: `Bestellung ${order.order_number}: ${label}`,
    html: wrapEmail("Statusänderung", body),
  };
}
