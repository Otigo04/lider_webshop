import type { Metadata } from "next";
import { CheckoutForm } from "@/components/forms/checkout-form";
import { requireUser } from "@/lib/auth";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Kasse" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  // Nur für die Anzeige der Bruttosumme. Verbindlich rechnet create_order()
  // mit dem Satz, den es selbst aus den Firmendaten festschreibt.
  const company = await getCompanySettings();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Bestellung aufgeben</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bestellung für {user.company_name || user.full_name || user.email}.
      </p>

      <div className="mt-8">
        <CheckoutForm
          adresse={{
            name: user.company_name || user.full_name,
            street: user.shipping_street,
            zip: user.shipping_zip,
            city: user.shipping_city,
            country: user.shipping_country,
          }}
          vatRate={company.pos_vat_rate}
        />
      </div>
    </div>
  );
}
