import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate, formatPrice } from "@/lib/format";
import { getAdminInvoices } from "@/lib/queries/admin";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Rechnungen" };

function isStatus(value: unknown): value is InvoiceStatus {
  return value === "open" || value === "paid" || value === "overdue";
}

export default async function AdminInvoicesPage({
  searchParams,
}: PageProps<"/admin/invoices">) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = isStatus(params.status) ? params.status : undefined;

  const invoices = await getAdminInvoices({ search, status });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Rechnungen</h1>
        <Button asChild>
          <Link href="/admin/invoices/new">Neue Rechnung</Link>
        </Button>
      </div>

      <form className="mt-6 flex flex-wrap gap-3" action="/admin/invoices">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Rechnungsnummer, Firma oder Name …"
          className="h-9 min-w-64 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Alle Status</option>
          {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((value) => (
            <option key={value} value={value}>
              {INVOICE_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filtern
        </Button>
      </form>

      <div className="mt-8 overflow-x-auto">
        {invoices.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            Keine Rechnungen gefunden.
          </p>
        ) : (
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nummer</th>
                <th className="py-2 pr-4 font-medium">Datum</th>
                <th className="py-2 pr-4 font-medium">Kunde</th>
                <th className="py-2 pr-4 font-medium">Art</th>
                <th className="py-2 pr-4 text-right font-medium">Betrag</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const amount =
                  invoice.type === "order"
                    ? (invoice.order?.total_amount ?? 0)
                    : (invoice.total_amount ?? 0);
                const href =
                  invoice.type === "order"
                    ? `/admin/orders/${invoice.order_id}`
                    : `/admin/invoices/${invoice.id}`;
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 tabular">
                      <Link href={href} className="font-medium hover:underline">
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 tabular text-muted-foreground">
                      {formatDate(invoice.issued_at)}
                    </td>
                    <td className="py-3 pr-4">
                      {invoice.customer?.company_name ||
                        invoice.customer?.full_name ||
                        "–"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {invoice.type === "order" ? "Bestellung" : "Frei"}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular">
                      {formatPrice(amount)}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
