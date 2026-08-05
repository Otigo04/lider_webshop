import { formatQuantity } from "@/lib/format";
import { stockLevel } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Verfügbarkeit als Textbadge. Bewusst ohne Punkt-/Ampel-Grafik: die Farbe
 * allein darf die Information nicht tragen (Farbsehschwäche), der Text sagt
 * es ohnehin.
 */
export function StockBadge({
  free,
  className,
}: {
  free: number;
  className?: string;
}) {
  const level = stockLevel(free);

  // success/warning sind eigene Theme-Tokens aus globals.css
  const styles = {
    ok: "border-success/30 bg-success/10 text-success",
    low: "border-warning/30 bg-warning/10 text-warning",
    out: "border-destructive/30 bg-destructive/10 text-destructive",
  }[level];

  const label = {
    ok: `${formatQuantity(free)} verfügbar`,
    low: `nur noch ${formatQuantity(free)} verfügbar`,
    out: "ausverkauft",
  }[level];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        styles,
        className,
      )}
    >
      {label}
    </span>
  );
}
