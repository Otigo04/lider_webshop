import "server-only";
import type { Order, OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { absatz, buttonHtml, feld, kasten, siteUrl, wrapEmail } from "@/lib/emails/layout";

export function orderStatusChangedEmail(
  order: Order,
  status: OrderStatus,
): { subject: string; html: string } {
  const label = ORDER_STATUS_LABELS[status];

  const body = `
    ${absatz(`Der Status Ihrer Bestellung <strong>${order.order_number}</strong> hat sich geändert.`)}
    ${kasten(feld("Neuer Status", `<strong style="font-size:18px;">${label}</strong>`))}
    ${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}
  `;

  return {
    subject: `Bestellung ${order.order_number}: ${label}`,
    html: wrapEmail("Neuer Stand Ihrer Bestellung", body, {
      preheader: `Bestellung ${order.order_number}: ${label}`,
    }),
  };
}
