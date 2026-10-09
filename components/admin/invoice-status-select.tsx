"use client";

import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { StatusSelect } from "@/components/admin/status-select";
import { INVOICE_STATUS_STYLES } from "@/components/invoice-status-badge";
import { updateInvoiceStatus } from "@/lib/actions/admin-orders";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/types";

export function InvoiceStatusSelect({
  invoiceId,
  orderId,
  status,
}: {
  invoiceId: string;
  /** Nur bei Bestellungs-Rechnungen gesetzt, freie Rechnungen haben keine Bestellung. */
  orderId?: string;
  status: InvoiceStatus;
}) {
  // Eine stornierte Rechnung bleibt es (Stornorechnung ist ausgestellt).
  if (status === "cancelled") return <InvoiceStatusBadge status={status} />;

  const { cancelled: _weg, ...wahl } = INVOICE_STATUS_LABELS;
  const { cancelled: _weg2, ...farben } = INVOICE_STATUS_STYLES;
  void _weg;
  void _weg2;

  return (
    <StatusSelect
      value={status}
      labels={wahl}
      styles={farben}
      action={updateInvoiceStatus}
      fields={{ id: invoiceId, orderId }}
      ariaLabel="Rechnungsstatus"
    />
  );
}
