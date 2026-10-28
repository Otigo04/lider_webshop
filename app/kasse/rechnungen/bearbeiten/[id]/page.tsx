import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { requireAdmin } from "@/lib/auth";
import { getAdminProducts, getCustomers } from "@/lib/queries/admin";
import { getInvoiceForOrder, getOrderWithCustomer } from "@/lib/queries/orders";
import { getConditions } from "@/lib/queries/vouchers";
import { positionenAusBestellung } from "@/lib/rechnung-positionen";

export const metadata: Metadata = { title: "Beleg bearbeiten" };

/**
 * Rechnung oder Lieferschein bearbeiten (Migration 081). Das Formular ist das
 * von „Neue Rechnung", gefüllt mit dem, was schon gebucht ist – wer etwas
 * ergänzen will, tippt nur noch das Neue.
 */
export default async function BelegBearbeitenPage({
  params,
}: PageProps<"/kasse/rechnungen/bearbeiten/[id]">) {
  await requireAdmin();
  const { id } = await params;

  const [order, rechnung, customers, products, konditionen] = await Promise.all([
    getOrderWithCustomer(id),
    getInvoiceForOrder(id),
    getCustomers(),
    getAdminProducts(),
    getConditions(),
  ]);
  if (!order) notFound();

  const gestellt = rechnung && rechnung.status !== "cancelled" ? rechnung : null;
  const storniert = order.status === "cancelled";

  if (storniert) {
    return (
      <div>
        <Link
          href={`/admin/orders/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Zur Bestellung
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Beleg bearbeiten</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Diese Bestellung ist storniert und lässt sich nicht mehr ändern. Eine neue Rechnung legst
          du unter „Neue Rechnung“ an.
        </p>
      </div>
    );
  }

  const konto = order.customer;
  const positionen = positionenAusBestellung(
    order.items ?? [],
    products.map((p) => ({ id: p.id, sku: p.sku })),
  );

  return (
    <div>
      <Link
        href={`/admin/orders/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Zur Bestellung {order.order_number}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Beleg bearbeiten</h1>

      <div className="mt-8">
        <InvoiceForm
          customers={customers.filter((customer) => customer.role === "customer")}
          products={products}
          konditionen={Object.fromEntries(
            [...konditionen].map(([kundenId, k]) => [kundenId, Number(k.discount_percent)]),
          )}
          bearbeiten={{
            orderId: order.id,
            orderNumber: order.order_number,
            rechnungsNummer: gestellt?.invoice_number ?? null,
            customerId: order.customer_id,
            kundeName: konto?.company_name || konto?.full_name || order.customer_label || "–",
            gast: {
              name: order.customer_label ?? "",
              strasse: order.customer_street ?? "",
              plz: order.customer_zip ?? "",
              ort: order.customer_city ?? "",
            },
            positionen,
            notes: order.notes ?? "",
            deliveryAddress: order.delivery_address ?? "",
            zahlungsvermerk: gestellt?.payment_note ?? null,
          }}
        />
      </div>
    </div>
  );
}
