import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanySettings } from "@/lib/queries/settings";
import { ChevronLeft, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateInvoiceButton } from "@/components/admin/create-invoice-button";
import { NotifyReadyButton } from "@/components/admin/notify-ready-button";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { InvoiceStatusSelect } from "@/components/admin/invoice-status-select";
import {
  formatDate,
  formatDateTime,
  formatPrice,
  formatQuantity,
  toNumber,
} from "@/lib/format";
import { steuer } from "@/lib/vat";
import { PAYMENT_METHOD_LABELS } from "@/lib/types";
import { getAdminOrder } from "@/lib/queries/admin";
import { getInvoiceForOrder } from "@/lib/queries/orders";
import { getInvoiceUrl } from "@/lib/storage";
import {
  DELIVERY_METHOD_LABELS,
  qualifiesForFreeShipping,
} from "@/lib/shipping";

export async function generateMetadata({
  params,
}: PageProps<"/admin/orders/[id]">): Promise<Metadata> {
  const { id } = await params;
  const order = await getAdminOrder(id);
  return { title: order ? `Bestellung ${order.order_number}` : "Bestellung" };
}

export default async function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) notFound();

  const items = order.items ?? [];
  const invoice = await getInvoiceForOrder(id);
  // Die Freigrenze ist eine Einstellung, keine Konstante (Migration 037).
  const firma = await getCompanySettings();
  const invoiceUrl = await getInvoiceUrl(invoice?.file_path);
  const betraege = steuer(toNumber(order.total_amount), toNumber(order.vat_rate));
  const abholung = order.delivery_method === "pickup";

  return (
    <div>
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Bestellungen
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight tabular">
          {order.order_number}
        </h1>
        <OrderStatusSelect orderId={order.id} status={order.status} />
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className="text-muted-foreground">Bestelldatum</dt>
          <dd className="mt-1 tabular">{formatDate(order.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kunde</dt>
          <dd className="mt-1">
            {order.customer?.company_name || order.customer?.full_name || "–"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-Mail</dt>
          <dd className="mt-1 break-all">{order.customer?.email ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gesamtbetrag</dt>
          <dd className="mt-1 font-semibold tabular">
            {formatPrice(betraege.brutto)}
          </dd>
          <dd className="text-xs text-muted-foreground tabular">
            {formatPrice(betraege.netto)} netto + {formatPrice(betraege.steuer)} USt.
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Zahlung</dt>
          <dd className="mt-1">{PAYMENT_METHOD_LABELS[order.payment_method]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lieferung</dt>
          <dd className="mt-1">
            {DELIVERY_METHOD_LABELS[order.delivery_method]}
            {order.delivery_method === "shipping" ? (
              <span className="ml-2 text-xs text-muted-foreground">
                {qualifiesForFreeShipping(
                  Number(order.total_amount),
                  firma.free_shipping_threshold,
                )
                  ? "versandkostenfrei"
                  : "Versandkosten berechnen"}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Artikel</th>
              <th className="py-2 pr-4 text-right font-medium">Menge</th>
              <th className="py-2 pr-4 text-right font-medium">Preis / Stück</th>
              <th className="py-2 text-right font-medium">Summe</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="py-3 pr-4">
                  <p className="text-xs text-muted-foreground tabular">
                    {item.product_sku}
                  </p>
                  <p className="font-medium">{item.product_name}</p>
                </td>
                <td className="py-3 pr-4 text-right tabular">
                  {formatQuantity(item.quantity)}
                </td>
                <td className="py-3 pr-4 text-right tabular">
                  {formatPrice(item.unit_price)}
                </td>
                <td className="py-3 text-right font-medium tabular">
                  {formatPrice(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abholung ? (
        <section className="mt-8 rounded-md border border-border p-4">
          <h2 className="font-medium">Selbstabholung</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <p className="text-muted-foreground">
              Wunschtermin:{" "}
              <span className="font-medium text-foreground tabular">
                {order.pickup_at ? formatDateTime(order.pickup_at) : "keiner angegeben"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Bereit gemeldet:{" "}
              <span className="font-medium text-foreground tabular">
                {order.ready_at ? formatDateTime(order.ready_at) : "noch nicht"}
              </span>
            </p>
            <NotifyReadyButton
              orderId={order.id}
              bereitsGemeldet={Boolean(order.ready_at)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Der Status &bdquo;Abholbereit&ldquo; verschickt die Benachrichtigung
            automatisch. Dieser Knopf schickt sie noch einmal, ohne den Status
            anzufassen.
          </p>
        </section>
      ) : null}

      <section className="mt-8 rounded-md border border-border p-4">
        <h2 className="font-medium">Papiere</h2>

        {/*
          Ein Klick für den ganzen Vorgang: Rechnung und Lieferschein liegen in
          einer Datei, der Betrachter geht auf und Strg+P druckt beide Blätter.
          Getrennt heruntergeladen wären es zwei Dateien, zwei Druckdialoge und
          die Frage, ob auch das zweite Blatt rausgekommen ist.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {invoice ? (
            <Button asChild size="sm">
              <a
                href={`/admin/orders/${order.id}/dokumente?art=beides`}
                target="_blank"
                rel="noreferrer"
              >
                <Printer className="size-4" aria-hidden />
                Rechnung + Lieferschein
              </a>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <a
              href={`/admin/orders/${order.id}/dokumente?art=lieferschein`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="size-4" aria-hidden />
              Nur Lieferschein
            </a>
          </Button>
          {invoice ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={
                  invoiceUrl ?? `/admin/orders/${order.id}/dokumente?art=rechnung`
                }
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="size-4" aria-hidden />
                Nur Rechnung
              </a>
            </Button>
          ) : null}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Der Lieferschein trägt Positionen und Mengen, aber keine Preise – er
          reist mit der Ware.
        </p>

        {invoice ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
            <span className="tabular">{invoice.invoice_number}</span>
            {invoiceUrl ? null : (
              <span className="text-muted-foreground">
                PDF wird noch erzeugt – der Knopf oben zeichnet sie neu.
              </span>
            )}
            <InvoiceStatusSelect
              invoiceId={invoice.id}
              orderId={order.id}
              status={invoice.status}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">
              Noch keine Rechnung vorhanden. Sie wird sonst beim Anlegen der
              Bestellung erzeugt und dem Kunden zugeschickt.
            </p>
            <CreateInvoiceButton orderId={order.id} />
          </div>
        )}
      </section>

      {order.delivery_address ? (
        <section className="mt-8">
          <h2 className="font-medium">Lieferadresse</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {order.delivery_address}
          </p>
        </section>
      ) : null}

      {order.notes ? (
        <section className="mt-8">
          <h2 className="font-medium">Anmerkungen des Kunden</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {order.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
