import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Euro,
  FolderTree,
  Package,
  Receipt,
  ShoppingCart,
  Users,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { StatCounter } from "@/components/stat-counter";
import { StockBadge } from "@/components/stock-badge";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { freeStock, stockLevel } from "@/lib/pricing";
import {
  getDashboardStats,
  getLowStockProducts,
  getRecentOrders,
  getTopProducts,
} from "@/lib/queries/admin";
import { getPosSales, getPosToday, getPosTopProducts } from "@/lib/queries/pos";

export const metadata: Metadata = { title: "Verwaltung" };

/** Zeit ohne Datum – für die Bons des laufenden Tages reicht die Uhrzeit. */
const uhrzeit = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminDashboardPage() {
  const [stats, orders, topProducts, lowStock, heute, posTop, letzteBons] =
    await Promise.all([
      getDashboardStats(),
      getRecentOrders(8),
      getTopProducts(5),
      getLowStockProducts(6),
      getPosToday(),
      getPosTopProducts(5),
      getPosSales({ limit: 5 }),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Verwaltung</h1>

      {/* Der Ladentag zuerst: was heute über den Tresen ging, ist die Zahl,
          die morgens als Erstes interessiert. */}
      <section className="mt-6">
        <h2 className="eyebrow text-muted-foreground">Ladenkasse heute</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Kachel
            href="/admin/sales"
            icon={Euro}
            label="Umsatz brutto"
            wert={formatPrice(heute.grossTotal)}
            ton="brand"
          />
          <Kachel
            href="/admin/sales"
            icon={Receipt}
            label="Belege"
            wert={formatQuantity(heute.salesCount)}
            ton="gold"
          />
          <Kachel
            href="/admin/pos"
            icon={Euro}
            label="davon netto"
            wert={formatPrice(heute.netTotal)}
            ton="neutral"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="eyebrow text-muted-foreground">Stammdaten und Bestellungen</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Kachel
            href="/admin/customers"
            icon={Users}
            label="Kunden aktiv"
            wert={<StatCounter value={stats.customersActive} />}
            ton="neutral"
          />
          <Kachel
            href="/admin/customers"
            icon={Users}
            label="Kunden deaktiviert"
            wert={<StatCounter value={stats.customersInactive} />}
            ton="neutral"
          />
          <Kachel
            href="/admin/products"
            icon={Package}
            label="Artikel"
            wert={<StatCounter value={stats.products} />}
            ton="neutral"
          />
          <Kachel
            href="/admin/categories"
            icon={FolderTree}
            label="Warengruppen"
            wert={<StatCounter value={stats.categories} />}
            ton="neutral"
          />
          <Kachel
            href="/admin/orders"
            icon={ShoppingCart}
            label="Offene Bestellungen"
            wert={<StatCounter value={stats.ordersOpen} />}
            ton={stats.ordersOpen > 0 ? "gold" : "neutral"}
          />
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-10">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Letzte Bestellungen</h2>
              <Link
                href="/admin/orders"
                className="text-sm text-brand hover:underline"
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
                    <tr className="border-b-2 border-border text-left text-muted-foreground">
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
                        <td className="whitespace-nowrap py-3 pr-4 tabular text-muted-foreground">
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

          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Letzte Kassenbons</h2>
              <Link
                href="/admin/sales"
                className="text-sm text-brand hover:underline"
              >
                alle ansehen
              </Link>
            </div>

            {letzteBons.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                Über die Kasse wurde noch nichts verkauft.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {letzteBons.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium tabular">
                        {sale.receipt_number}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {uhrzeit.format(new Date(sale.created_at))} Uhr ·{" "}
                        {sale.customer?.company_name ||
                          sale.customer?.full_name ||
                          sale.customer_label ||
                          "Barverkauf"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular">
                      {formatPrice(sale.total_amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="font-medium">Meistverkauft an der Kasse</h2>
            <p className="text-xs text-muted-foreground">letzte 30 Tage</p>
            {posTop.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Noch keine Kassenverkäufe.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {posTop.map((product) => (
                  <li key={product.sku} className="flex justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="code text-xs text-muted-foreground">
                        {product.sku}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular">
                        {formatQuantity(product.quantity)} Stk.
                      </p>
                      <p className="text-xs text-muted-foreground tabular">
                        {formatPrice(product.revenue)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-medium">Meistbestellt online</h2>
            {topProducts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Noch keine Auswertung möglich.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {topProducts.map((product) => (
                  <li key={product.sku} className="flex justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="code text-xs text-muted-foreground">
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
            <h2 className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              Bestand wird knapp
            </h2>
            {lowStock.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Noch keine Artikel angelegt.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {lowStock.map((product) => {
                  const frei = freeStock(product);
                  const stufe = stockLevel(frei);
                  return (
                    <li
                      key={product.id}
                      className={`flex items-center justify-between gap-3 p-3 ${
                        stufe === "out"
                          ? "bg-destructive/10"
                          : stufe === "low"
                            ? "bg-warning/10"
                            : ""
                      }`}
                    >
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className="min-w-0 truncate text-sm font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <StockBadge free={frei} className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Kennzahlkachel. Der Ton entscheidet über die Farbe: Markenblau für die
 * Leitzahl, Gold für alles, was Aufmerksamkeit will, sonst neutral. Mehr
 * Farben wären hier Selbstzweck.
 */
function Kachel({
  href,
  icon: Icon,
  label,
  wert,
  ton,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  wert: React.ReactNode;
  ton: "brand" | "gold" | "neutral";
}) {
  const flaeche = {
    brand: "border-brand/40 bg-brand-soft",
    gold: "border-gold/40 bg-gold-soft",
    neutral: "border-border bg-card",
  }[ton];

  const symbol = {
    brand: "bg-brand text-brand-foreground",
    gold: "bg-gold text-gold-foreground",
    neutral: "bg-muted text-muted-foreground",
  }[ton];

  const zahl = {
    brand: "text-brand",
    gold: "text-gold",
    neutral: "",
  }[ton];

  return (
    <Link
      href={href}
      className={`card-hover flex items-start justify-between gap-3 rounded-lg border-2 p-4 ${flaeche}`}
    >
      <span>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className={`mt-1 block text-2xl font-semibold tabular ${zahl}`}>
          {wert}
        </span>
      </span>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${symbol}`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
    </Link>
  );
}
