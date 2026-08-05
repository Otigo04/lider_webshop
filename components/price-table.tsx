import { toNumber } from "@/lib/format";
import { formatPrice, formatQuantity } from "@/lib/format";
import { discountPercent, highestUnitPrice, sortTiers } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PriceTier } from "@/lib/types";

/**
 * Staffelpreise als absteigende Leiter.
 *
 * Die Balkenlänge ist der Stückpreis im Verhältnis zur teuersten Stufe: die
 * oberste Staffel füllt die Breite, jede günstigere wird kürzer. Damit ist der
 * Preisverlauf auf einen Blick erkennbar, ohne Zahlen zu vergleichen. Die
 * Zahlen stehen trotzdem daneben – der Balken ist die Zugabe, nicht der Ersatz.
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

  const maxPrice = highestUnitPrice(tiers) ?? 1;

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="eyebrow text-muted-foreground">Staffelpreise</h2>
        <p className="text-xs text-muted-foreground">
          Preis je Stück, netto
        </p>
      </div>

      <ol className="mt-1">
        {tiers.map((tier) => {
          const price = toNumber(tier.unit_price);
          // Mindestbreite, damit auch die günstigste Stufe ein Balken bleibt.
          const width = Math.max((price / maxPrice) * 100, 12);
          const discount = discountPercent(tiers, tier);
          const isActive = tier.id === activeTierId;

          return (
            <li
              key={tier.id}
              className={cn(
                "border-b border-border py-3 last:border-0",
                isActive && "-mx-3 border-transparent bg-brand/5 px-3",
              )}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p
                  className={cn(
                    "code text-sm",
                    isActive ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {tier.max_quantity
                    ? `${formatQuantity(tier.min_quantity)}–${formatQuantity(tier.max_quantity)}`
                    : `ab ${formatQuantity(tier.min_quantity)}`}
                  <span className="ml-1 font-sans text-xs">Stück</span>
                </p>

                <p className="flex items-baseline gap-2">
                  {discount ? (
                    <span className="text-xs text-success">−{discount} %</span>
                  ) : null}
                  <span
                    className={cn(
                      "tabular text-base",
                      isActive ? "font-semibold text-brand" : "font-medium",
                    )}
                  >
                    {formatPrice(price)}
                  </span>
                </p>
              </div>

              <div
                className="mt-2 h-1.5 rounded-xs bg-muted"
                role="presentation"
              >
                <div
                  className={cn(
                    "h-full rounded-xs",
                    isActive ? "bg-brand" : "bg-foreground/25",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
