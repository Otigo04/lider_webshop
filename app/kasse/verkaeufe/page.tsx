import type { Metadata } from "next";
import Link from "next/link";
import { Printer, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, formatQuantity } from "@/lib/format";
import { getPosSales, getPosSummary } from "@/lib/queries/pos";
import { POS_PAYMENT_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Verkäufe" };

/** Datum und Uhrzeit – beim Kassenbon zählt die Minute, nicht nur der Tag. */
const zeitpunkt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function alsText(wert: string | string[] | undefined): string {
  return typeof wert === "string" ? wert : "";
}

export default async function AdminSalesPage({
  searchParams,
}: PageProps<"/kasse/verkaeufe">) {
  const params = await searchParams;
  const von = alsText(params.von);
  const bis = alsText(params.bis);
  const suche = alsText(params.q);
  const zahlartRoh = alsText(params.zahlart);
  const zahlart =
    zahlartRoh === "cash" || zahlartRoh === "card" ? zahlartRoh : undefined;

  const sales = await getPosSales({ from: von, to: bis, search: suche, payment: zahlart });

  // Kennzahlen des angezeigten Zeitraums. Ohne Datumsfilter: der laufende Tag.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const morgen = new Date(heute);
  morgen.setDate(morgen.getDate() + 1);

  const zeitraum = await getPosSummary(
    von ? new Date(`${von}T00:00:00`) : heute,
    bis ? naechsterTag(bis) : morgen,
  );

  const angezeigterUmsatz = sales.reduce(
    (summe, sale) => summe + Number(sale.total_amount),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verkäufe</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {sales.length === 1 ? "1 Beleg" : `${sales.length} Belege`} ·{" "}
            {formatPrice(angezeigterUmsatz)}
          </p>
        </div>
        <Button asChild>
          <Link href="/kasse/terminal">
            <Receipt className="size-4" aria-hidden /> Zur Kasse
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Kennzahl
          label={von || bis ? "Belege im Zeitraum" : "Belege heute"}
          wert={formatQuantity(zeitraum.salesCount)}
        />
        <Kennzahl
          label={von || bis ? "Umsatz brutto" : "Umsatz heute brutto"}
          wert={formatPrice(zeitraum.grossTotal)}
          betont
        />
        <Kennzahl label="davon netto" wert={formatPrice(zeitraum.netTotal)} />
      </div>

      <form
        action="/kasse/verkaeufe"
        className="mt-8 grid gap-3 rounded-lg border border-border bg-muted/60 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="von">Von</Label>
          <Input id="von" name="von" type="date" defaultValue={von} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bis">Bis</Label>
          <Input id="bis" name="bis" type="date" defaultValue={bis} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zahlart">Zahlart</Label>
          <select
            id="zahlart"
            name="zahlart"
            defaultValue={zahlart ?? ""}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">alle</option>
            <option value="cash">Bar</option>
            <option value="card">Karte</option>
          </select>
        </div>
        <div className="space-y-1.5 lg:col-span-1">
          <Label htmlFor="q">Beleg, Artikel oder Kunde</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={suche}
              placeholder="LB0000012 oder Artikelname"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Filtern</Button>
          <Button asChild variant="ghost">
            <Link href="/kasse/verkaeufe">Zurücksetzen</Link>
          </Button>
        </div>
      </form>

      {sales.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Keine Verkäufe für diese Auswahl.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Beleg</th>
                <th className="py-2 pr-4 font-medium">Zeitpunkt</th>
                <th className="py-2 pr-4 font-medium">Kunde</th>
                <th className="py-2 pr-4 font-medium">Positionen</th>
                <th className="py-2 pr-4 font-medium">Zahlart</th>
                <th className="py-2 pr-4 text-right font-medium">Netto</th>
                <th className="py-2 pr-4 text-right font-medium">Brutto</th>
                <th className="py-2 text-right font-medium">Beleg</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 font-medium tabular">
                    {sale.receipt_number}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4 tabular text-muted-foreground">
                    {zeitpunkt.format(new Date(sale.created_at))}
                  </td>
                  <td className="py-3 pr-4">
                    {sale.customer?.company_name ||
                      sale.customer?.full_name ||
                      sale.customer_label ||
                      "Barverkauf"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    <span className="tabular">{(sale.items ?? []).length}</span>
                    {sale.items?.length ? (
                      <span className="ml-2 text-xs">
                        {sale.items
                          .slice(0, 2)
                          .map((item) => item.product_name)
                          .join(", ")}
                        {sale.items.length > 2 ? " …" : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        sale.payment_method === "cash" ? "tag-6" : "tag-1"
                      }`}
                    >
                      {POS_PAYMENT_LABELS[sale.payment_method]}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right tabular text-muted-foreground">
                    {formatPrice(sale.net_amount)}
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold tabular">
                    {formatPrice(sale.total_amount)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="secondary" size="sm">
                        <a
                          href={`/kasse/verkaeufe/${sale.id}/bon`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Printer className="size-4" aria-hidden /> Bon
                        </a>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={`/kasse/verkaeufe/${sale.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          PDF
                        </a>
                      </Button>
                    </div>
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

/** Tagesanfang des Folgetags – "bis" soll den gewählten Tag einschließen. */
function naechsterTag(datum: string): Date {
  const tag = new Date(`${datum}T00:00:00`);
  tag.setDate(tag.getDate() + 1);
  return tag;
}

function Kennzahl({
  label,
  wert,
  betont,
}: {
  label: string;
  wert: string;
  betont?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        betont ? "border-brand/40 bg-brand-soft" : "border-border bg-card"
      }`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular ${
          betont ? "text-brand" : ""
        }`}
      >
        {wert}
      </p>
    </div>
  );
}
