"use client";

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
  return (
    <StatusSelect
      value={status}
      labels={INVOICE_STATUS_LABELS}
      styles={INVOICE_STATUS_STYLES}
      action={updateInvoiceStatus}
      fields={{ id: invoiceId, orderId }}
      ariaLabel="Rechnungsstatus"
    />
  );
}
