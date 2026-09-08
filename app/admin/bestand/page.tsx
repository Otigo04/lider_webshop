import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, PackagePlus, Search, Sparkles } from "lucide-react";
import { Wareneingang } from "@/components/admin/wareneingang";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, formatQuantity } from "@/lib/format";
import { getStockEntries, summiere } from "@/lib/queries/stock";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";

export const metadata: Metadata = { title: "Bestand" };

const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Bestand – Wareneingang und sein Journal.
 *
 * Eigener Reiter neben der Artikelverwaltung, weil es ein anderer Vorgang ist:
 * dort werden Stammdaten gepflegt (Beschreibung, Fotos, Staffeln), hier wird
 * eine Lieferung abgearbeitet. Wer auspackt, braucht ein Scannerfeld und eine
 * Liste, keine Artikeltabelle mit fünfzehn Spalten.
 */
export default async function BestandPage({
  searchParams,
}: PageProps<"/admin/bestand">) {
  const params = await searchParams;
  const suche = typeof params.q === "string" ? params.q : "";

  const [categories, journal, attributes, zuletztKategorieId] = await Promise.all([
    getCategories(),
    getStockEntries({ search: suche, limit: 100 }),
    getProductAttributes(),
    getLastUsedCategoryId(),
  ]);

  const summe = summiere(journal);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bestand</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Neue Ware scannen, Menge und Preise eintragen, alles auf einmal
            buchen. Unbekannte Codes werden dabei als Artikel angelegt.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/products/new">
            <PackagePlus className="size-4" aria-hidden />
            Einzelnen Artikel ausführlich anlegen
          </Link>
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Legen Sie zuerst eine{" "}
          <Link href="/admin/categories" className="underline">
            Warengruppe
          </Link>{" "}
          an – jeder Artikel braucht eine.
        </p>
      ) : (
        <div className="mt-8">
          <Wareneingang
            categories={categories}
            attributes={attributes}
            zuletztKategorieId={zuletztKategorieId}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- Journal */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Letzte Wareneingänge
            </h2>
            <p className="mt-1 text-sm text-muted-foreground tabular">
              {formatQuantity(summe.buchungen)}{" "}
              {summe.buchungen === 1 ? "Buchung" : "Buchungen"} ·{" "}
              {formatQuantity(summe.stueck)} Stück ·{" "}
              {formatQuantity(summe.neueArtikel)} neu angelegt
            </p>
          </div>

          <form className="flex gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="q"
                defaultValue={suche}
                placeholder="Artikel, Nummer oder Barcode"
                aria-label="Wareneingänge durchsuchen"
                className="w-64 pl-9"
              />
            </div>
            <Button type="submit" variant="outline">
              Suchen
            </Button>
          </form>
        </div>

        {journal.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            {suche
              ? "Zu dieser Suche gibt es keine Buchung."
              : "Es wurde noch kein Wareneingang gebucht."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Zeitpunkt</th>
                  <th className="py-2 pr-3 font-medium">Artikel</th>
                  <th className="py-2 pr-3 text-right font-medium">Menge</th>
                  <th className="py-2 pr-3 text-right font-medium">Bestand</th>
                  <th className="py-2 pr-3 text-right font-medium">Preise gesetzt</th>
                  <th className="py-2 font-medium">Notiz</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((eintrag) => (
                  <tr key={eintrag.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-3 tabular text-muted-foreground">
                      {ZEITPUNKT.format(new Date(eintrag.created_at))}
                    </td>

                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5 font-medium">
                        {eintrag.product_id ? (
                          <Link
                            href={`/admin/products/${eintrag.product_id}/edit`}
                            className="hover:underline"
                          >
                            {eintrag.product_name}
                          </Link>
                        ) : (
                          eintrag.product_name
                        )}
                        {eintrag.is_new_product ? (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-gold-soft px-1.5 py-px text-xs text-gold"
                            title="Mit dieser Buchung angelegt"
                          >
                            <Sparkles className="size-3" aria-hidden />
                            neu
                          </span>
                        ) : null}
                      </span>
                      <span className="code text-xs text-muted-foreground">
                        {eintrag.product_sku}
                        {eintrag.barcode ? ` · ${eintrag.barcode}` : ""}
                      </span>
                    </td>

                    <td className="py-2.5 pr-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold tabular ${
                          eintrag.quantity < 0 ? "text-signal" : "text-success"
                        }`}
                      >
                        {eintrag.quantity < 0 ? (
                          <ArrowDownRight className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        )}
                        {eintrag.quantity > 0 ? "+" : ""}
                        {formatQuantity(eintrag.quantity)}
                      </span>
                    </td>

                    <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
                      {formatQuantity(eintrag.stock_before)} →{" "}
                      <span className="font-medium text-foreground">
                        {formatQuantity(eintrag.stock_after)}
                      </span>
                    </td>

                    <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
                      {eintrag.unit_price === null && eintrag.retail_price === null
                        ? "–"
                        : [
                            eintrag.unit_price !== null
                              ? `GH ${formatPrice(eintrag.unit_price)}`
                              : null,
                            eintrag.retail_price !== null
                              ? `EH ${formatPrice(eintrag.retail_price)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </td>

                    <td className="py-2.5 text-muted-foreground">
                      {eintrag.note ?? ""}
                      {eintrag.erfasser ? (
                        <span className="block text-xs">
                          {eintrag.erfasser.full_name || eintrag.erfasser.email}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
