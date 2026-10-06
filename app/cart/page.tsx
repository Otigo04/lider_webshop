import type { Metadata } from "next";
import { CartContents } from "@/components/cart-contents";
import { requireUser } from "@/lib/auth";
import { getCompanySettings } from "@/lib/queries/settings";
import { getMeineKondition } from "@/lib/queries/vouchers";

export const metadata: Metadata = { title: "Warenkorb" };

export default async function CartPage() {
  await requireUser("/cart");
  const [company, kondition] = await Promise.all([
    getCompanySettings(),
    getMeineKondition(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Warenkorb</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Mengen lassen sich hier noch ändern. Der Stückpreis springt automatisch
        auf die passende Staffel.
      </p>

      <div className="mt-8">
        <CartContents
          vatRate={company.pos_vat_rate}
          versandFreiAb={company.free_shipping_threshold}
          kundenSatz={kondition}
        />
      </div>
    </div>
  );
}
