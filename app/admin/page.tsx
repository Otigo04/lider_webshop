import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { StockBadge } from "@/components/stock-badge";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { freeStock } from "@/lib/pricing";
import {
  getDashboardStats,
  getLowStockProducts,
  getRecentOrders,
  getTopProducts,
} from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Verwaltung" };

export default async function AdminDashboardPage() {
  const [stats, orders, topProducts, lowStock] = await Promise.all([
    getDashboardStats(),
    getRecentOrders(10),
    getTopProducts(5),
    getLowStockProducts(5),
  ]);

  const tiles = [
    { label: "Kunden aktiv", value: stats.customersActive, href: "/admin/customers" },
    {
      label: "Kunden deaktiviert",
      value: stats.customersInactive,
      href: "/admin/customers",
    },
    { label: "Artikel", value: stats.products, href: "/admin/products" },
    { label: "Kategorien", value: stats.categories, href: "/admin/categories" },
    { label: "Offene Bestellungen", value: stats.ordersOpen, href: "/admin/orders" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Verwaltung</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-md border border-border bg-card p-4 hover:border-foreground/25"
          >
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular">
              {formatQuantity(tile.value)}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Letzte Bestellungen</h2>
            <Link
              href="/admin/orders"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              alle ansehen
            </Link>
          </div>

          {orders.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Noch keine Bestellungen eingegangen.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-2xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Nummer</th>
                    <th className="py-2 pr-4 font-medium">Datum</th>
                    <th className="py-2 pr-4 font-medium">Kunde</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Summe</th>
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
        </section>

        <div className="space-y-8">
          <section>
            <h2 className="font-medium">Meistbestellt</h2>
            {topProducts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Noch keine Auswertung möglich.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {topProducts.map((product) => (
                  <li key={product.sku} className="flex justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular">
                        {product.sku}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm tabular">
                      {formatQuantity(product.quantity)} Stk.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-medium">Niedrigster Bestand</h2>
            {lowStock.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Noch keine Artikel angelegt.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {lowStock.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="min-w-0 truncate text-sm font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <StockBadge free={freeStock(product)} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
