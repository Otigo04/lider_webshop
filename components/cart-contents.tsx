"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { formatPrice, formatQuantity } from "@/lib/format";
import { lineTotal, minOrderQuantity, resolveTier } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export function CartContents() {
  const { items, ready, total, itemCount, updateQuantity, removeItem, clear } =
    useCart();

  // Vor dem Lesen des localStorage würde ein leerer Warenkorb angezeigt und
  // gleich darauf ersetzt – das Flackern fängt der Skeleton ab.
  if (!ready) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Ihr Warenkorb ist leer.
        </p>
        <Button asChild className="mt-4">
          <Link href="/shop">Zum Sortiment</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-border rounded-md border border-border">
        {items.map((item) => {
          const tier = resolveTier(item.tiers, item.quantity);
          const min = minOrderQuantity(item.tiers);

          return (
            <li key={item.productId} className="flex flex-wrap gap-4 p-4">
              <div className="min-w-48 flex-1">
                <p className="text-xs text-muted-foreground tabular">
                  {item.productSku}
                </p>
                <Link
                  href={`/shop/product/${item.productId}`}
                  className="font-medium hover:underline"
                >
                  {item.productName}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tier
                    ? `${formatPrice(tier.unit_price)} / Stück`
                    : `Mindestmenge ${formatQuantity(min)} Stück`}
                </p>
              </div>

              <div className="w-28">
                <Input
                  type="number"
                  min={min}
                  max={item.maxStock}
                  step={1}
                  value={item.quantity}
                  aria-label={`Menge für ${item.productName}`}
                  onChange={(event) =>
                    updateQuantity(
                      item.productId,
                      Number.parseInt(event.target.value, 10) || min,
                    )
                  }
                  className="tabular"
                />
              </div>

              <div className="w-28 text-right">
                <p className="font-semibold tabular">
                  {formatPrice(lineTotal(item.tiers, item.quantity))}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${item.productName} entfernen`}
                onClick={() => removeItem(item.productId)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      <aside className="h-fit rounded-md border border-border p-5">
        <h2 className="font-medium">Zusammenfassung</h2>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Positionen</dt>
            <dd className="tabular">{items.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Stück gesamt</dt>
            <dd className="tabular">{formatQuantity(itemCount)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Summe netto</span>
          <span className="text-2xl font-semibold tabular">
            {formatPrice(total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          zzgl. USt. und Versand
        </p>

        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/checkout">Zur Kasse</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={clear}
        >
          Warenkorb leeren
        </Button>
      </aside>
    </div>
  );
}
