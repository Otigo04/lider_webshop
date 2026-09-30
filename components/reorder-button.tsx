"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import type { CartItem } from "@/lib/types";

/**
 * Legt alle noch lieferbaren Positionen einer alten Bestellung in den
 * Warenkorb und führt dorthin. Geprüft und gebucht wird wie immer erst beim
 * Absenden – hier werden nur Mengen vorgeschlagen.
 */
export function ReorderButton({
  items,
  fehlend,
}: {
  items: CartItem[];
  fehlend: string[];
}) {
  const { addItem } = useCart();
  const router = useRouter();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine der Positionen ist derzeit lieferbar.
      </p>
    );
  }

  function nachbestellen() {
    for (const item of items) addItem(item);
    toast.success(
      `${items.length} ${items.length === 1 ? "Position" : "Positionen"} im Warenkorb`,
      {
        description: fehlend.length
          ? `Nicht mehr lieferbar: ${fehlend.join(", ")}`
          : "Mengen lassen sich dort noch ändern.",
      },
    );
    router.push("/cart");
  }

  return (
    <div className="space-y-1 text-right">
      <Button type="button" onClick={nachbestellen}>
        <RotateCcw className="size-4" aria-hidden />
        Erneut bestellen
      </Button>
      {fehlend.length ? (
        <p className="max-w-xs text-xs text-muted-foreground">
          Nicht mehr lieferbar: {fehlend.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
