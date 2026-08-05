"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";
import { formatPrice, formatQuantity } from "@/lib/format";
import { lineTotal, minOrderQuantity, resolveTier } from "@/lib/pricing";
import { PriceTable } from "@/components/price-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PriceTier } from "@/lib/types";

interface ProductPurchaseProps {
  productId: string;
  productName: string;
  productSku: string;
  tiers: PriceTier[];
  freeStock: number;
}

/**
 * Mengeneingabe, Live-Preis und "In den Warenkorb". Hält die Menge als State,
 * damit die Staffeltabelle die passende Zeile hervorheben kann.
 */
export function ProductPurchase({
  productId,
  productName,
  productSku,
  tiers,
  freeStock,
}: ProductPurchaseProps) {
  const min = minOrderQuantity(tiers);
  const [quantity, setQuantity] = useState<number>(min);
  const { addItem } = useCart();

  const soldOut = freeStock <= 0;
  const noPrices = tiers.length === 0;
  const activeTier = resolveTier(tiers, quantity);

  const belowMin = quantity < min;
  const aboveStock = quantity > freeStock;
  const error = belowMin
    ? `Mindestbestellmenge: ${formatQuantity(min)} Stück`
    : aboveStock
      ? `Nur ${formatQuantity(freeStock)} Stück verfügbar`
      : null;

  function handleAdd() {
    if (error || !activeTier) return;
    addItem({
      productId,
      productName,
      productSku,
      quantity,
      tiers,
      maxStock: freeStock,
    });
    toast.success(`${formatQuantity(quantity)} × ${productName} im Warenkorb`, {
      action: { label: "Warenkorb", onClick: () => location.assign("/cart") },
    });
  }

  return (
    <div className="space-y-6">
      <PriceTable variants={tiers} activeTierId={activeTier?.id} />

      {noPrices ? null : (
        <div className="rounded-md border border-border p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-32 space-y-2">
              <Label htmlFor="quantity">Menge</Label>
              <Input
                id="quantity"
                type="number"
                inputMode="numeric"
                min={min}
                max={freeStock}
                step={1}
                value={quantity}
                disabled={soldOut}
                onChange={(event) =>
                  setQuantity(Number.parseInt(event.target.value, 10) || 0)
                }
                className="tabular"
              />
            </div>

            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                {activeTier
                  ? `${formatPrice(activeTier.unit_price)} / Stück`
                  : `ab ${formatQuantity(min)} Stück bestellbar`}
              </p>
              <p className="text-2xl font-semibold tabular">
                {formatPrice(lineTotal(tiers, quantity))}
              </p>
            </div>

            <Button
              type="button"
              size="lg"
              onClick={handleAdd}
              disabled={soldOut || Boolean(error)}
            >
              In den Warenkorb
            </Button>
          </div>

          {soldOut ? (
            <p className="mt-3 text-sm text-destructive">
              Dieser Artikel ist derzeit ausverkauft.
            </p>
          ) : error ? (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Preise verstehen sich netto zzgl. USt.{" "}
              <Link href="/cart" className="underline">
                Warenkorb ansehen
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
