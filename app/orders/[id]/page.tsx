import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Landmark,
  Package,
  Store,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, formatPrice, formatQuantity } from "@/lib/format";
import { getInvoiceForOrder, getOrder } from "@/lib/queries/orders";
import { getCompanySettings } from "@/lib/queries/settings";
import { getInvoiceUrl } from "@/lib/storage";
import { steuer } from "@/lib/vat";
import { DELIVERY_METHOD_LABELS } from "@/lib/shipping";
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/types";
import { toNumber } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/orders/[id]">): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);
  return { title: order ? `Bestellung ${order.order_number}` : "Bestellung" };
}

/** Zahlungsziel = Rechnungsdatum plus die in den Firmendaten gepflegten Tage. */
function faelligAm(issuedAt: string, tage: number): string {
  const datum = new Date(issuedAt);
  datum.setDate(datum.getDate() + tage);
  return formatDate(datum);
}

function Zeile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium tabular">{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  await requireUser(`/orders/${id}`);

  // RLS liefert fremde Bestellungen gar nicht erst aus – hier landet dann null.
  const order = await getOrder(id);
  if (!order) notFound();

  const items = order.items ?? [];
  const [invoice, company] = await Promise.all([
    getInvoiceForOrder(id),
    getCompanySettings(),
  ]);
  const invoiceUrl = await getInvoiceUrl(invoice?.file_path);

  const betraege = steuer(toNumber(order.total_amount), toNumber(order.vat_rate));
  const frischBestellt = query.neu !== undefined;
  const abholung = order.delivery_method === "pickup";
  const ueberweisung = order.payment_method === "transfer";
  const offen = invoice?.status !== "paid";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Bestellungen
      </Link>

      {/*
        Direkt nach dem Absenden landet der Kunde hier, nicht in der Liste: er
        will wissen, ob es geklappt hat und was er jetzt zu tun hat – nicht
        seine Bestellung aus einer Tabelle heraussuchen.
      */}
      {frischBestellt ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-medium text-success">Bestellung eingegangen</p>
            <p className="mt-1 text-sm text-success/90">
              Bestätigung und Rechnung sind unterwegs an Ihre E-Mail-Adresse.
              {ueberweisung
                ? " Nach Zahlungseingang gehen wir in die Bearbeitung."
                : " Wir melden uns, sobald die Ware bereitsteht."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight tabular">
            {order.order_number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            Bestellt am {formatDate(order.created_at)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          {/* Positionen – schmale Bildschirme als Karten. */}
          <section>
            <h2 className="font-medium">Positionen</h2>

            <ul className="mt-3 divide-y divide-border rounded-md border border-border sm:hidden">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="code text-xs text-muted-foreground">
                      {item.product_sku}
                    </p>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground tabular">
                      {formatQuantity(item.quantity)} × {formatPrice(item.unit_price)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular">
                    {formatPrice(item.subtotal)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Artikel</th>
                    <th className="py-2 pr-4 text-right font-medium">Menge</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Preis / Stück netto
                    </th>
                    <th className="py-2 text-right font-medium">Summe netto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-4">
                        <p className="code text-xs text-muted-foreground">
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
          </section>

          {/* Lieferung oder Abholung */}
          <section className="rounded-md border border-border p-5">
            <h2 className="flex items-center gap-2 font-medium">
              {abholung ? (
                <Store className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Package className="size-4 text-muted-foreground" aria-hidden />
              )}
              {DELIVERY_METHOD_LABELS[order.delivery_method]}
            </h2>

            {abholung ? (
              <div className="mt-3 space-y-2 text-sm">
                {order.ready_at ? (
                  <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-success">
                    Ihre Ware liegt seit {formatDateTime(order.ready_at)} zur
                    Abholung bereit.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Wir melden uns per E-Mail, sobald die Ware bereitsteht.
                  </p>
                )}
                {order.pickup_at ? (
                  <p className="text-muted-foreground">
                    Ihr Wunschtermin:{" "}
                    <span className="font-medium text-foreground tabular">
                      {formatDateTime(order.pickup_at)}
                    </span>
                  </p>
                ) : null}
                {company.address_street ? (
                  <p className="whitespace-pre-line pt-1 text-muted-foreground">
                    {[
                      company.company_name,
                      company.address_street,
                      `${company.address_zip ?? ""} ${company.address_city ?? ""}`.trim(),
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {[
                  order.delivery_name,
                  order.delivery_street,
                  `${order.delivery_zip ?? ""} ${order.delivery_city ?? ""}`.trim(),
                  order.delivery_country &&
                  order.delivery_country.toLowerCase() !== "deutschland"
                    ? order.delivery_country
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n") ||
                  order.delivery_address ||
                  "Keine Lieferadresse hinterlegt."}
              </p>
            )}
          </section>

          {order.notes ? (
            <section>
              <h2 className="font-medium">Ihre Anmerkungen</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {order.notes}
              </p>
            </section>
          ) : null}
        </div>

        {/* Betrag und Zahlung – die eine Frage, die der Kunde hier hat. */}
        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          <div className="rounded-md border border-border p-5">
            <h2 className="font-medium">Betrag</h2>
            <dl className="mt-3">
              <Zeile label="Summe netto" value={formatPrice(betraege.netto)} />
              <Zeile
                label={`zzgl. ${betraege.satz.toFixed(0)} % USt.`}
                value={formatPrice(betraege.steuer)}
              />
            </dl>
            <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
              <span className="text-sm font-medium">Gesamtbetrag</span>
              <span className="text-2xl font-semibold tabular">
                {formatPrice(betraege.brutto)}
              </span>
            </div>
          </div>

          <div className="rounded-md border border-border p-5">
            <h2 className="flex items-center gap-2 font-medium">
              {ueberweisung ? (
                <Landmark className="size-4 text-muted-foreground" aria-hidden />
              ) : order.payment_method === "card" ? (
                <CreditCard className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Banknote className="size-4 text-muted-foreground" aria-hidden />
              )}
              {PAYMENT_METHOD_LABELS[order.payment_method]}
            </h2>

            {ueberweisung ? (
              offen ? (
                <>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Bitte überweisen Sie den Gesamtbetrag. Die Bearbeitung
                    startet mit dem Zahlungseingang.
                  </p>
                  <dl className="mt-3">
                    {company.iban ? (
                      <Zeile
                        label="IBAN"
                        value={<span className="code">{company.iban}</span>}
                      />
                    ) : null}
                    {company.bic ? (
                      <Zeile
                        label="BIC"
                        value={<span className="code">{company.bic}</span>}
                      />
                    ) : null}
                    {company.bank_name ? (
                      <Zeile label="Bank" value={company.bank_name} />
                    ) : null}
                    {invoice ? (
                      <Zeile
                        label="Verwendungszweck"
                        value={<span className="code">{invoice.invoice_number}</span>}
                      />
                    ) : null}
                    <Zeile label="Betrag" value={formatPrice(betraege.brutto)} />
                    {invoice ? (
                      <Zeile
                        label="Zahlbar bis"
                        value={faelligAm(
                          invoice.issued_at,
                          company.payment_terms_days,
                        )}
                      />
                    ) : null}
                  </dl>
                  {!company.iban ? (
                    <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                      Die Bankverbindung finden Sie auf der Rechnung im Anhang
                      unserer E-Mail.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  Zahlung eingegangen. Vielen Dank.
                </p>
              )
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Sie zahlen{" "}
                {order.payment_method === "card" ? "mit Karte" : "bar"} bei der
                Abholung. Vorab ist nichts zu tun.
              </p>
            )}
          </div>

          {invoice ? (
            <div className="rounded-md border border-border p-5">
              <h2 className="font-medium">Rechnung</h2>
              <dl className="mt-3">
                <Zeile
                  label="Nummer"
                  value={<span className="code">{invoice.invoice_number}</span>}
                />
                <Zeile label="Status" value={INVOICE_STATUS_LABELS[invoice.status]} />
              </dl>
              {invoiceUrl ? (
                <a
                  href={invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm text-foreground underline underline-offset-2 hover:no-underline"
                >
                  Rechnung herunterladen (PDF)
                </a>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  PDF wird noch erzeugt …
                </p>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
