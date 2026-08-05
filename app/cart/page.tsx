import type { Metadata } from "next";
import { CartContents } from "@/components/cart-contents";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Warenkorb" };

export default async function CartPage() {
  await requireUser("/cart");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Warenkorb</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Mengen lassen sich hier noch ändern. Der Stückpreis springt automatisch
        auf die passende Staffel.
      </p>

      <div className="mt-8">
        <CartContents />
      </div>
    </div>
  );
}
