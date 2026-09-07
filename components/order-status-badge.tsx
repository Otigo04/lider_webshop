import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Farbe je Status. „Eingegangen" und „Bestätigt" waren bisher nicht zu
 * unterscheiden – beide Markenblau. Jetzt trägt jeder Status seine eigene
 * Farbe, damit sich eine Bestellliste überfliegen lässt: grau liegend, blau
 * eingegangen, gold in Arbeit, grün abholbereit, orange unterwegs, grün zugestellt.
 */
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  submitted: "border-brand/40 bg-brand/10 text-brand",
  confirmed: "border-gold/50 bg-gold-soft text-gold",
  ready: "border-success/40 bg-success/10 text-success",
  shipped: "border-warning/40 bg-warning/10 text-warning",
  delivered: "border-success/40 bg-success/10 text-success",
};

const STATUS_STYLES = ORDER_STATUS_STYLES;

/** Randfarbe passend zum Status, z. B. für Bestellkarten auf schmalen Bildschirmen. */
export function orderStatusAccent(status: OrderStatus): string {
  const accents: Record<OrderStatus, string> = {
    draft: "border-l-muted-foreground/40",
    submitted: "border-l-brand",
    confirmed: "border-l-gold",
    ready: "border-l-success",
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
