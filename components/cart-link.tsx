"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";

/** Warenkorb-Link mit Positionszähler. */
export function CartLink() {
  const { items, ready } = useCart();
  const count = items.length;

  // Sitzt in der dunklen Kopfleiste, deshalb helle Schrift statt der
  // Standardfarben der Ghost-Variante.
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="gap-2 text-surface-dark-muted hover:bg-white/10 hover:text-surface-dark-foreground"
    >
      <Link href="/cart">
        <ShoppingCart className="size-4" aria-hidden />
        <span className="hidden sm:inline">Warenkorb</span>
        {ready && count > 0 ? (
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-xs font-medium text-brand-foreground tabular">
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
