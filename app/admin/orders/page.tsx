import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceStatusSelect } from "@/components/admin/invoice-status-select";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { formatDate, formatPrice } from "@/lib/format";
import { getAdminOrders, orderInvoice } from "@/lib/queries/admin";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bestellungen" };

function isStatus(value: string): value is OrderStatus {
  return value in ORDER_STATUS_LABELS;
}

const SORT_LABELS = { date: "Datum", customer: "Kunde" } as const;
type SortKey = keyof typeof SORT_LABELS;

function isSort(value: string): value is SortKey {
  return value === "date" || value === "customer";
}

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : "";
  const status = isStatus(raw) ? raw : undefined;
  const rawSort = typeof params.sort === "string" ? params.sort : "";
  const sort = isSort(rawSort) ? rawSort : "date";

  const orders = await getAdminOrders(status, sort);

  function sortHref(key: SortKey) {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    query.set("sort", key);
    return `/admin/orders?${query.toString()}`;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Bestellungen</h1>

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {(["alle", ...Object.keys(ORDER_STATUS_LABELS)] as const).map((value) => {
          const active =
            value === "alle" ? status === undefined : status === value;
          const query = new URLSearchParams();
          if (value !== "alle") query.set("status", value);
          if (sort !== "date") query.set("sort", sort);
          const href = query.toString()
            ? `/admin/orders?${query.toString()}`
            : "/admin/orders";
          return (
            <Link
              key={value}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {value === "alle"
                ? "Alle"
                : ORDER_STATUS_LABELS[value as OrderStatus]}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Keine Bestellungen in dieser Auswahl.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nummer</th>
                <th className="py-2 pr-4 font-medium">
                  <Link
                    href={sortHref("date")}
                    className={cn(
                      "hover:text-foreground",
                      sort === "date" && "text-foreground underline underline-offset-2",
                    )}
                  >
                    {SORT_LABELS.date}
                  </Link>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <Link
                    href={sortHref("customer")}
                    className={cn(
                      "hover:text-foreground",
                      sort === "customer" &&
                        "text-foreground underline underline-offset-2",
                    )}
                  >
                    {SORT_LABELS.customer}
                  </Link>
                </th>
                <th className="py-2 pr-4 font-medium">Pos.</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Rechnung</th>
                <th className="py-2 text-right font-medium">Summe netto</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const invoice = orderInvoice(order);
                return (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-medium tabular hover:underline"
                      >
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 tabular text-muted-foreground">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      {order.customer?.company_name ||
                        order.customer?.full_name ||
                        order.customer?.email ||
                        "–"}
                    </td>
                    <td className="py-3 pr-4 tabular text-muted-foreground">
                      {order.items?.length ?? 0}
                    </td>

                    {/* Status direkt hier umstellen – ohne Umweg über die
                        Detailseite, wo der Vorgang bisher lag. */}
                    <td className="py-3 pr-4">
                      <OrderStatusSelect orderId={order.id} status={order.status} />
                    </td>

                    <td className="py-3 pr-4">
                      {invoice ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground tabular">
                            {invoice.invoice_number}
                          </span>
                          <InvoiceStatusSelect
                            invoiceId={invoice.id}
                            orderId={order.id}
                            status={invoice.status}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          keine
                        </span>
                      )}
                    </td>

                    <td className="py-3 text-right font-medium tabular">
                      {formatPrice(order.total_amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
