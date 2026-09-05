import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<OrderStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  submitted: "border-brand/30 bg-brand/10 text-brand",
  confirmed: "border-brand/30 bg-brand/10 text-brand",
  shipped: "border-warning/30 bg-warning/10 text-warning",
  delivered: "border-success/30 bg-success/10 text-success",
};

/** Randfarbe passend zum Status, z. B. für Bestellkarten auf schmalen Bildschirmen. */
export function orderStatusAccent(status: OrderStatus): string {
  const accents: Record<OrderStatus, string> = {
    draft: "border-l-muted-foreground/40",
    submitted: "border-l-brand",
    confirmed: "border-l-brand",
    shipped: "border-l-warning",
    delivered: "border-l-success",
  };
  return accents[status];
}

/** Bestellstatus als Textbadge. Farbe ist Zusatz, nicht Träger der Information. */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const styles = STATUS_STYLES;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
