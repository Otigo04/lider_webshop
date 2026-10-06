import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { getAdminProducts, getCustomers } from "@/lib/queries/admin";
import { getConditions } from "@/lib/queries/vouchers";

export const metadata: Metadata = { title: "Neue Rechnung" };

export default async function NewInvoicePage() {
  const [customers, products, konditionen] = await Promise.all([
    getCustomers(),
    getAdminProducts(),
    getConditions(),
  ]);

  return (
    <div>
      <Link
        href="/kasse/rechnungen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Rechnungen
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Neue Rechnung
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Aus dem Katalog für eine echte Bestellung, oder frei für
        Dienstleistungen und Ware außerhalb des Sortiments.
      </p>

      <div className="mt-8">
        <InvoiceForm
          customers={customers.filter((customer) => customer.role === "customer")}
          products={products}
          konditionen={Object.fromEntries(
            [...konditionen].map(([id, k]) => [id, Number(k.discount_percent)]),
          )}
        />
      </div>
    </div>
  );
}
