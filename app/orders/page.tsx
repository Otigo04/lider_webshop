import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, orderStatusAccent } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPrice, formatQuantity, toNumber } from "@/lib/format";
import { brutto } from "@/lib/vat";
import { getOrders } from "@/lib/queries/orders";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bestellungen" };

const FILTERS: (OrderStatus | "alle")[] = [
  "alle",
  "submitted",
  "confirmed",
  "ready",
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

  const orders = await getOrders({ status });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Bestellungen</h1>

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
        <>
          {/* Schmale Bildschirme: Karten statt Tabelle – nichts zum
              Seitwärtsscrollen. */}
          <ul className="mt-6 space-y-3 md:hidden">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className={cn(
                    "card-hover flex flex-col gap-2 rounded-md border border-l-4 border-border p-4",
                    orderStatusAccent(order.status),
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium tabular">
                      {order.order_number}
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span className="tabular">
                      {formatDate(order.created_at)} ·{" "}
                      {formatQuantity(order.items?.length ?? 0)} Positionen
                    </span>
                    <span className="font-semibold tabular text-foreground">
                      {formatPrice(
                        brutto(toNumber(order.total_amount), toNumber(order.vat_rate)),
                      )}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Ab md: klassische Tabelle, mehr Spalten passen ohne Scrollen. */}
          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-2xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Nummer</th>
                  <th className="py-2 pr-4 font-medium">Datum</th>
                  <th className="py-2 pr-4 font-medium">Positionen</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Gesamtbetrag</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={cn(
                      "border-b border-l-4 border-border last:border-b-0",
                      orderStatusAccent(order.status),
                    )}
                  >
                    <td className="py-3 pr-4 pl-3">
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
                      {formatPrice(
                        brutto(toNumber(order.total_amount), toNumber(order.vat_rate)),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
