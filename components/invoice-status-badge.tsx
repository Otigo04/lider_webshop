import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Farbe je Rechnungsstatus. Offen ist eine Forderung, kein Fehler – deshalb
 * neutral blau; überfällig trägt die Signalfarbe des Logos, bezahlt Grün.
 */
export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  open: "border-brand/40 bg-brand/10 text-brand",
  paid: "border-success/40 bg-success/10 text-success",
  overdue: "border-signal/40 bg-signal-soft text-signal",
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        INVOICE_STATUS_STYLES[status],
        className,
      )}
    >
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}
