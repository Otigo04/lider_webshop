import type { Metadata } from "next";
import { CheckoutForm } from "@/components/forms/checkout-form";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Kasse" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Bestellung aufgeben</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bestellung für {user.company_name || user.full_name || user.email}.
      </p>

      <div className="mt-8">
        <CheckoutForm defaultAddress={user.shipping_address ?? undefined} />
      </div>
    </div>
  );
}
