import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { InvoiceStatusSelect } from "@/components/admin/invoice-status-select";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { getManualInvoice } from "@/lib/queries/admin";
import { getInvoiceUrl } from "@/lib/storage";
import { INVOICE_STATUS_LABELS } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/kasse/rechnungen/[id]">): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getManualInvoice(id);
  return { title: invoice ? `Rechnung ${invoice.invoice_number}` : "Rechnung" };
}

export default async function AdminInvoiceDetailPage({
  params,
}: PageProps<"/kasse/rechnungen/[id]">) {
  const { id } = await params;
  const invoice = await getManualInvoice(id);
  if (!invoice) notFound();

  const invoiceUrl = await getInvoiceUrl(invoice.file_path);
  const items = invoice.items ?? [];

  return (
    <div>
      <Link
        href="/kasse/rechnungen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Rechnungen
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight tabular">
          {invoice.invoice_number}
        </h1>
        <InvoiceStatusSelect invoiceId={invoice.id} status={invoice.status} />
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Rechnungsdatum</dt>
          <dd className="mt-1 tabular">{formatDate(invoice.issued_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kunde</dt>
          <dd className="mt-1">
            {invoice.customer.company_name || invoice.customer.full_name || "–"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-Mail</dt>
          <dd className="mt-1 break-all">{invoice.customer.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="mt-1">{INVOICE_STATUS_LABELS[invoice.status]}</dd>
        </div>
      </dl>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Beschreibung</th>
              <th className="py-2 pr-4 text-right font-medium">Menge</th>
              <th className="py-2 pr-4 text-right font-medium">Preis / Einheit</th>
              <th className="py-2 pr-4 text-right font-medium">MwSt.</th>
              <th className="py-2 text-right font-medium">Summe</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="py-3 pr-4 font-medium">{item.description}</td>
                <td className="py-3 pr-4 text-right tabular">
                  {formatQuantity(item.quantity)}
                </td>
                <td className="py-3 pr-4 text-right tabular">
                  {formatPrice(item.unit_price)}
                </td>
                <td className="py-3 pr-4 text-right tabular">
                  {item.vat_rate.toFixed(0)} %
                </td>
                <td className="py-3 text-right font-medium tabular">
                  {formatPrice(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 ml-auto max-w-xs space-y-2 rounded-md border border-border p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Netto</span>
          <span className="tabular">{formatPrice(invoice.net_amount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">MwSt.</span>
          <span className="tabular">{formatPrice(invoice.vat_amount)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
          <span>Gesamt</span>
          <span className="tabular">{formatPrice(invoice.total_amount)}</span>
        </div>
      </section>

      {invoice.notes ? (
        <section className="mt-8">
          <h2 className="font-medium">Notiz</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {invoice.notes}
          </p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-medium">PDF</h2>
        {invoiceUrl ? (
          <a
            href={invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-foreground underline underline-offset-2 hover:no-underline"
          >
            PDF herunterladen
          </a>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            PDF wird noch erzeugt …
          </p>
        )}
      </section>
    </div>
  );
}
