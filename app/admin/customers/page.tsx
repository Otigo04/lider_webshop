import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { CustomerForm } from "@/components/forms/customer-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { getCustomers } from "@/lib/queries/admin";
import { getConditions, getUmsatzJeKunde } from "@/lib/queries/vouchers";
import { satzText } from "@/lib/rabatt";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Kunden" };

const FILTER = [
  ["alle", "Alle"],
  ["aktiv", "Aktiv"],
  ["inaktiv", "Deaktiviert"],
  ["kondition", "Mit Sonderkondition"],
] as const;
type Filter = (typeof FILTER)[number][0];

export default async function AdminCustomersPage({
  searchParams,
}: PageProps<"/admin/customers">) {
  await requireAdmin();
  const params = await searchParams;

  // Alte Links auf ?edit=… führen jetzt in die Kundenakte.
  if (typeof params.edit === "string") redirect(`/admin/customers/${params.edit}`);

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const filter: Filter = FILTER.some(([k]) => k === params.filter)
    ? (params.filter as Filter)
    : "alle";

  const [customers, konditionen, umsaetze] = await Promise.all([
    getCustomers(),
    getConditions(),
    getUmsatzJeKunde(),
  ]);

  // Wortweise wie überall (vgl. lib/search.ts): jedes Wort muss irgendwo stehen.
  const woerter = q.toLowerCase().split(/\s+/).filter(Boolean);
  const gefiltert = customers.filter((c) => {
    if (filter === "aktiv" && !c.is_active) return false;
    if (filter === "inaktiv" && c.is_active) return false;
    if (filter === "kondition" && !(Number(konditionen.get(c.id)?.discount_percent) > 0)) {
      return false;
    }
    if (woerter.length === 0) return true;
    const heuhaufen = [
      c.company_name,
      c.full_name,
      c.email,
      c.customer_number,
      c.billing_city,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return woerter.every((w) => heuhaufen.includes(w));
  });

  const aktive = customers.filter((c) => c.is_active && c.role === "customer").length;
  const mitKondition = [...konditionen.values()].filter(
    (k) => Number(k.discount_percent) > 0,
  ).length;

  function filterLink(f: Filter) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (f !== "alle") sp.set("filter", f);
    const s = sp.toString();
    return s ? `/admin/customers?${s}` : "/admin/customers";
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kunden</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {aktive} aktive Kunden · {mitKondition} mit Sonderkondition. Klick
            auf einen Kunden öffnet die Kundenakte.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/gutscheine">Gutscheine verwalten</Link>
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <form className="flex flex-wrap items-center gap-2" action="/admin/customers">
            <div className="relative min-w-56 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Firma, Name, E-Mail, Kundennummer, Ort"
                className="pl-8"
              />
            </div>
            {filter !== "alle" ? <input type="hidden" name="filter" value={filter} /> : null}
            <Button type="submit" variant="secondary">
              Suchen
            </Button>
          </form>

          <nav aria-label="Filter" className="mt-3 flex flex-wrap gap-1">
            {FILTER.map(([key, label]) => (
              <Link
                key={key}
                href={filterLink(key)}
                aria-current={filter === key ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  filter === key
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 overflow-x-auto">
            {gefiltert.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                {customers.length === 0 ? "Noch keine Kunden angelegt." : "Kein Kunde passt zur Suche."}
              </p>
            ) : (
              <table className="w-full min-w-3xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {/* Kundennummer ganz vorn: danach wird gesucht, wenn ein
                        Kunde anruft oder eine Überweisung zugeordnet werden
                        muss. */}
                    <th className="py-2 pr-4 font-medium">Nr.</th>
                    <th className="py-2 pr-4 font-medium">Kunde</th>
                    <th className="py-2 pr-4 font-medium">Kondition</th>
                    <th className="py-2 pr-4 text-right font-medium">Bestellungen</th>
                    <th className="py-2 pr-4 text-right font-medium">Umsatz netto</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2" aria-label="Öffnen" />
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.map((c) => {
                    const satz = Number(konditionen.get(c.id)?.discount_percent ?? 0);
                    const umsatz = umsaetze.get(c.id);
                    return (
                      <tr
                        key={c.id}
                        className="group relative border-b border-border last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pr-4 tabular font-medium">
                          {c.customer_number ?? "–"}
                        </td>
                        <td className="py-3 pr-4">
                          {/* Der Link spannt über die ganze Zeile (after:inset-0). */}
                          <Link
                            href={`/admin/customers/${c.id}`}
                            className="font-medium after:absolute after:inset-0 group-hover:text-brand"
                          >
                            {c.company_name || c.full_name || c.email}
                          </Link>
                          {c.role === "admin" ? (
                            <span className="ml-2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              Admin
                            </span>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {[c.company_name ? c.full_name : null, c.email]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          {satz > 0 ? (
                            <span className="rounded-md border border-gold/40 bg-gold-soft px-2 py-0.5 text-xs font-semibold tabular text-[#7a4a10]">
                              −{satzText(satz)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right tabular">
                          {umsatz?.bestellungen ?? 0}
                          {umsatz?.letzteBestellung ? (
                            <p className="text-xs text-muted-foreground">
                              zuletzt {formatDate(umsatz.letzteBestellung)}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-right tabular">
                          {formatPrice(umsatz?.umsatzNetto ?? 0)}
                        </td>
                        <td className="py-3 pr-4">
                          {c.is_active ? (
                            <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                              aktiv
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              deaktiviert
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          <ChevronRight className="ml-auto size-4" aria-hidden />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="h-fit rounded-md border border-border p-5">
          <h2 className="font-medium">Neuer Kunde</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Für Telefonbesteller. Kunden können sich auch selbst unter
            /register anmelden.
          </p>
          <div className="mt-4">
            <CustomerForm key="neu" />
          </div>
        </aside>
      </div>
    </div>
  );
}
