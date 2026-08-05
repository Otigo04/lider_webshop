import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { getOrders } from "@/lib/queries/orders";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bestellungen" };

const FILTERS: (OrderStatus | "alle")[] = [
  "alle",
  "submitted",
  "confirmed",
  "shipped",
  "delivered",
];

function isStatus(value: string): value is OrderStatus {
  return value in ORDER_STATUS_LABELS;
}

export default async function OrdersPage({
  searchParams,
}: PageProps<"/orders">) {
  await requireUser("/orders");
  const params = await searchParams;

  const statusParam = typeof params.status === "string" ? params.status : "";
  const status = isStatus(statusParam) ? statusParam : undefined;
  const justOrdered = typeof params.neu === "string" ? params.neu : null;

  const orders = await getOrders({ status });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Bestellungen</h1>

      {justOrdered ? (
        <p className="mt-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Bestellung <span className="font-semibold tabular">{justOrdered}</span>{" "}
          ist eingegangen. Wir melden uns zur Bestätigung.
        </p>
      ) : null}

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {FILTERS.map((value) => {
          const active =
            value === "alle" ? status === undefined : status === value;
          return (
            <Link
              key={value}
              href={value === "alle" ? "/orders" : `/orders?status=${value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {value === "alle" ? "Alle" : ORDER_STATUS_LABELS[value]}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {status
              ? "Keine Bestellungen mit diesem Status."
              : "Sie haben noch nichts bestellt."}
          </p>
          <Button asChild className="mt-4">
            <Link href="/shop">Zum Sortiment</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nummer</th>
                <th className="py-2 pr-4 font-medium">Datum</th>
                <th className="py-2 pr-4 font-medium">Positionen</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Summe netto</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium tabular hover:underline"
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 tabular text-muted-foreground">
                    {formatDate(order.created_at)}
                  </td>
                  <td className="py-3 pr-4 tabular text-muted-foreground">
                    {formatQuantity(order.items?.length ?? 0)}
                  </td>
                  <td className="py-3 pr-4">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="py-3 text-right font-medium tabular">
                    {formatPrice(order.total_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
