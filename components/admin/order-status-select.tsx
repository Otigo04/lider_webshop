"use client";

import { StatusSelect } from "@/components/admin/status-select";
import { ORDER_STATUS_STYLES } from "@/components/order-status-badge";
import { updateOrderStatus } from "@/lib/actions/admin-orders";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

/**
 * Bestellstatus ändern – in der Liste wie auf der Detailseite dasselbe Feld.
 * Die Auswahl speichert selbst (components/admin/status-select.tsx), einen
 * Übernehmen-Knopf gibt es nicht mehr.
 */
export function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  return (
    <StatusSelect
      value={status}
      labels={ORDER_STATUS_LABELS}
      styles={ORDER_STATUS_STYLES}
      action={updateOrderStatus}
      fields={{ id: orderId }}
      ariaLabel="Bestellstatus"
    />
  );
}
