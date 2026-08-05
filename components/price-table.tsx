import { formatPrice, formatQuantity } from "@/lib/format";
import { discountPercent, sortTiers } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PriceTier } from "@/lib/types";

/**
 * Staffelpreise als Tabelle. `activeTierId` hebt die Staffel hervor, die zur
 * aktuell eingegebenen Menge gehört.
 */
export function PriceTable({
  variants,
  activeTierId,
}: {
  variants: PriceTier[];
  activeTierId?: string | null;
}) {
  const tiers = sortTiers(variants);

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Für diesen Artikel sind noch keine Preise hinterlegt.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Menge</th>
          <th className="py-2 pr-4 text-right font-medium">Preis / Stück</th>
          <th className="py-2 text-right font-medium">Ersparnis</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((tier) => {
          const discount = discountPercent(tiers, tier);
          const isActive = tier.id === activeTierId;

          return (
            <tr
              key={tier.id}
              className={cn(
                "border-b border-border last:border-0",
                isActive && "bg-brand/5",
              )}
            >
              <td className="py-2 pr-4 tabular">
                {tier.max_quantity
                  ? `${formatQuantity(tier.min_quantity)} – ${formatQuantity(tier.max_quantity)} Stück`
                  : `ab ${formatQuantity(tier.min_quantity)} Stück`}
              </td>
              <td
                className={cn(
                  "py-2 pr-4 text-right tabular",
                  isActive ? "font-semibold text-brand" : "font-medium",
                )}
              >
                {formatPrice(tier.unit_price)}
              </td>
              <td className="py-2 text-right tabular text-muted-foreground">
                {discount ? `−${discount} %` : "–"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
