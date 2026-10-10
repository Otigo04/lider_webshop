"use client";

import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";
import { formatQuantity } from "@/lib/format";
import { PREORDER_MAX_QUANTITY, minOrderQuantity } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PriceTier } from "@/lib/types";

/**
 * „In den Warenkorb" direkt aus dem Sortiment, mit der Mindestmenge. Wer
 * mehr will oder die Staffeln vergleicht, geht wie bisher auf die
 * Artikelseite – im Warenkorb lässt sich die Menge ohnehin noch ändern.
 */
export function QuickAddButton({
  productId,
  productName,
  productSku,
  tiers,
  freeStock,
  imagePath,
  vorbestellung = null,
  className,
}: {
  productId: string;
  productName: string;
  productSku: string;
  tiers: PriceTier[];
  freeStock: number;
  imagePath: string | null;
  /** Gesetzt, wenn der Artikel nur vorbestellbar ist (kein freier Bestand) */
  vorbestellung?: { hinweis: string | null } | null;
  className?: string;
}) {
  const { addItem } = useCart();
  const router = useRouter();
  const menge = minOrderQuantity(tiers);

  function hinzufuegen() {
    addItem({
      productId,
      productName,
      productSku,
      quantity: menge,
      tiers,
      maxStock: vorbestellung ? PREORDER_MAX_QUANTITY : freeStock,
      imagePath,
      preorder: Boolean(vorbestellung),
      preorderNote: vorbestellung?.hinweis ?? null,
    });
    toast.success(
      `${formatQuantity(menge)} × ${productName} ${vorbestellung ? "vorbestellt" : "im Warenkorb"}`, {
      action: { label: "Warenkorb", onClick: () => router.push("/cart") },
    });
  }

  const label =
    menge > 1
      ? `${formatQuantity(menge)} Stück ${productName} in den Warenkorb`
      : `${productName} in den Warenkorb`;

  return (
    <button
      type="button"
      onClick={hinzufuegen}
      aria-label={label}
      title={menge > 1 ? `${formatQuantity(menge)} Stück in den Warenkorb` : "In den Warenkorb"}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <ShoppingCart className="size-4" aria-hidden />
    </button>
  );
}
