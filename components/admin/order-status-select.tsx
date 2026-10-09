"use client";

import { OrderStatusBadge } from "@/components/order-status-badge";
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
  // „Storniert“ entsteht nur über die Stornierung der Rechnung und lässt sich
  // weder hier setzen noch zurücknehmen.
  if (status === "cancelled") return <OrderStatusBadge status={status} />;

  const { cancelled: _weg, ...wahl } = ORDER_STATUS_LABELS;
  const { cancelled: _weg2, ...farben } = ORDER_STATUS_STYLES;
  void _weg;
  void _weg2;

  return (
    <StatusSelect
      value={status}
      labels={wahl}
      styles={farben}
      action={updateOrderStatus}
      fields={{ id: orderId }}
      ariaLabel="Bestellstatus"
    />
  );
}
