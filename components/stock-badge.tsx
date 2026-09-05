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
    ok: "border-success/40 bg-success/15 text-success",
    low: "border-warning/40 bg-warning/15 text-warning",
    out: "border-destructive/40 bg-destructive/15 text-destructive",
  }[level];

  const label = {
    ok: `${formatQuantity(free)} verfügbar`,
    low: `nur noch ${formatQuantity(free)} verfügbar`,
    out: "ausverkauft",
  }[level];

  return (
    <span
      className={cn(
        // whitespace-nowrap ist hier kein Feinschliff: in schmalen
        // Tabellenspalten brach "nur noch 12 verfügbar" hinter der Zahl um und
        // zog die Zeile auf.
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        styles,
        className,
      )}
    >
      {label}
    </span>
  );
}
