import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { requireUser } from "@/lib/auth";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { getOrder } from "@/lib/queries/orders";

export async function generateMetadata({
  params,
}: PageProps<"/orders/[id]">): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);
  return { title: order ? `Bestellung ${order.order_number}` : "Bestellung" };
}

export default async function OrderDetailPage({
  params,
}: PageProps<"/orders/[id]">) {
  const { id } = await params;
  await requireUser(`/orders/${id}`);

  // RLS liefert fremde Bestellungen gar nicht erst aus – hier landet dann null.
  const order = await getOrder(id);
  if (!order) notFound();

  const items = order.items ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Bestellungen
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight tabular">
          {order.order_number}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Bestelldatum</dt>
          <dd className="mt-1 tabular">{formatDate(order.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Positionen</dt>
          <dd className="mt-1 tabular">{formatQuantity(items.length)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Summe netto</dt>
          <dd className="mt-1 font-semibold tabular">
            {formatPrice(order.total_amount)}
          </dd>
        </div>
      </dl>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-xl border-collapse text-sm">
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
          <tfoot>
            <tr>
              <td colSpan={3} className="py-3 pr-4 text-right text-muted-foreground">
                Summe netto
              </td>
              <td className="py-3 text-right text-lg font-semibold tabular">
                {formatPrice(order.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

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
          <h2 className="font-medium">Anmerkungen</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {order.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
