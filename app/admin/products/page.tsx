import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { InlineEdit } from "@/components/admin/inline-edit";
import { ProductFlagsMenu } from "@/components/admin/product-flag-toggle";
import { StockBadge } from "@/components/stock-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteProduct } from "@/lib/actions/admin-products";
import { formatPrice, formatQuantity } from "@/lib/format";
import { freeStock, lowestUnitPrice, reduzierung } from "@/lib/pricing";
import { getAdminProducts } from "@/lib/queries/admin";
import { getCategories } from "@/lib/queries/products";
import { getProductFlags } from "@/lib/queries/product-flags";

export const metadata: Metadata = { title: "Artikel" };

/**
 * Eine Preiszeile in der Sammelspalte: links das Kürzel (GH = Großhandel,
 * EH = Einzelhandel, „vorher" = Streichpreis), rechts das bearbeitbare Feld.
 */
function PreisZeile({
  kuerzel,
  children,
}: {
  kuerzel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {kuerzel}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Artikelverwaltung.
 *
 * Die Tabelle ist gleichzeitig das Bearbeitungsformular: Bezeichnung, Barcode,
 * Warengruppe, Preis und Bestand lassen sich direkt in der Zelle ändern und
 * gehen sofort in die Datenbank (components/admin/inline-edit.tsx). Für alles
 * Weitere – Staffeln, Fotos, Beschreibung – führt der Name in die Detailseite.
 */
export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const ohneBild = params.bild === "ohne";
  const inaktiv = params.status === "inaktiv";
  const flagIds = (Array.isArray(params.flag) ? params.flag : params.flag ? [params.flag] : []).filter(
    (f): f is string => typeof f === "string",
  );

  const [products, categories, customFlags] = await Promise.all([
    getAdminProducts({ search, ohneBild, inaktiv, flagIds }),
    getCategories(),
    getProductFlags(),
  ]);

  const kategorieOptionen = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const ohneBarcode = products.filter((product) => !product.barcode).length;
  const FESTE_FLAGS = [
    { value: "is_new", label: "Neuheit" },
    { value: "is_topseller", label: "Topseller" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Artikel</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {products.length === 1 ? "1 Artikel" : `${products.length} Artikel`}
            {ohneBarcode > 0
              ? ` · ${formatQuantity(ohneBarcode)} ohne Barcode`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/products" className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Name oder Artikelnummer"
                aria-label="Artikel suchen"
                className="pl-9"
              />
            </div>

            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="bild"
                value="ohne"
                defaultChecked={ohneBild}
                className="size-4 rounded border-input"
              />
              Ohne Bild
            </label>

            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="status"
                value="inaktiv"
                defaultChecked={inaktiv}
                className="size-4 rounded border-input"
              />
              Ausgeblendet
            </label>

            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Flags{flagIds.length > 0 ? ` (${flagIds.length})` : ""}
              </summary>
              <div className="absolute z-10 mt-1 min-w-48 rounded-md border border-border bg-popover p-2 shadow-md">
                {FESTE_FLAGS.map((flag) => (
                  <label
                    key={flag.value}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="flag"
                      value={flag.value}
                      defaultChecked={flagIds.includes(flag.value)}
                      className="size-4 rounded border-input"
                    />
                    {flag.label}
                  </label>
                ))}
                {customFlags.length > 0 ? (
                  <>
                    <div className="my-1.5 border-t border-border" />
                    {customFlags.map((flag) => (
                      <label
                        key={flag.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          name="flag"
                          value={flag.id}
                          defaultChecked={flagIds.includes(flag.id)}
                          className="size-4 rounded border-input"
                        />
                        <span
                          aria-hidden
                          className={`inline-block size-2 rounded-full tag-dot-${flag.color}`}
                        />
                        {flag.name}
                      </label>
                    ))}
                  </>
                ) : null}
              </div>
            </details>

            <Button type="submit" variant="secondary">
              Filtern
            </Button>
          </form>

          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="size-4" /> Neuer Artikel
            </Link>
          </Button>
        </div>
      </div>

      <p className="mt-4 rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-sm text-brand">
        Bezeichnung, Barcode, Warengruppe, alle drei Preise (GH = Großhandel,
        EH = Einzelhandel, vorher = Streichpreis) und der Bestand lassen sich
        direkt in der Tabelle ändern – anklicken, tippen, Enter.
      </p>

      {products.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {search || ohneBild || inaktiv || flagIds.length > 0
            ? "Keine Treffer für diese Suche/Filter."
            : "Noch keine Artikel angelegt."}
        </p>
      ) : (
        /*
         * Eine Tabellenbreite, keine Seitwärtsbewegung: früher standen zehn
         * Spalten nebeneinander und „Löschen" lag jenseits des Bildrands.
         * Zusammengelegt sind jetzt Artikelnummer unter die Bezeichnung, die
         * drei Preise in eine Spalte und Bestand samt Verfügbarkeit in eine
         * weitere. Die Aktionen sind Symbolknöpfe mit Beschriftung für
         * Screenreader.
         */
        <div className="mt-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Artikel</th>
                <th className="py-2 pr-3 font-medium">Barcode</th>
                <th className="py-2 pr-3 font-medium">Warengruppe</th>
                <th className="py-2 pr-3 font-medium">Preise</th>
                <th className="py-2 pr-3 font-medium">Bestand</th>
                <th className="py-2 pr-3 font-medium">Flags</th>
                <th className="w-20 py-2 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const ab = lowestUnitPrice(product.variants ?? []);
                const rabatt = reduzierung(product.list_price, ab);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border align-top last:border-0 hover:bg-muted/50"
                  >
                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="name"
                        value={product.name}
                        anzeige={product.name}
                        className="font-medium"
                      />
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 px-2 text-xs text-muted-foreground">
                        <span className="tabular">{product.sku}</span>
                        {!product.is_active ? (
                          <span className="rounded border border-border bg-muted px-1 py-px">
                            ausgeblendet
                          </span>
                        ) : null}
                      </p>
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="barcode"
                        value={product.barcode ?? ""}
                        anzeige={product.barcode ?? "—"}
                        className={product.barcode ? "code" : "text-muted-foreground"}
                      />
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="category_id"
                        typ="select"
                        optionen={kategorieOptionen}
                        value={product.category_id}
                        anzeige={product.category?.name ?? "—"}
                        className="text-muted-foreground"
                      />
                    </td>

                    {/* Drei Preise übereinander statt in drei Spalten: die
                        Kürzel tragen die Bedeutung, die Zeile bleibt schmal. */}
                    <td className="py-2 pr-3">
                      <div className="space-y-0.5">
                        <PreisZeile kuerzel="GH">
                          <InlineEdit
                            id={product.id}
                            field="unit_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={ab !== null ? String(ab) : "0"}
                            anzeige={ab !== null ? formatPrice(ab) : "—"}
                          />
                        </PreisZeile>
                        <PreisZeile kuerzel="EH">
                          <InlineEdit
                            id={product.id}
                            field="retail_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={
                              product.retail_price !== null
                                ? String(product.retail_price)
                                : ""
                            }
                            anzeige={
                              product.retail_price !== null
                                ? formatPrice(product.retail_price)
                                : "—"
                            }
                            className={
                              product.retail_price === null
                                ? "text-muted-foreground"
                                : ""
                            }
                          />
                        </PreisZeile>
                        <PreisZeile kuerzel={rabatt ? `−${rabatt.prozent} %` : "vorher"}>
                          <InlineEdit
                            id={product.id}
                            field="list_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={
                              product.list_price !== null
                                ? String(product.list_price)
                                : ""
                            }
                            anzeige={
                              product.list_price !== null
                                ? formatPrice(product.list_price)
                                : "—"
                            }
                            className={
                              rabatt
                                ? "text-signal line-through"
                                : "text-muted-foreground"
                            }
                          />
                        </PreisZeile>
                      </div>
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="stock_available"
                        typ="number"
                        ausrichtung="right"
                        einheit="Stk."
                        value={String(product.stock_available)}
                        anzeige={formatQuantity(product.stock_available)}
                      />
                      <div className="mt-0.5 px-2">
                        <StockBadge free={freeStock(product)} />
                      </div>
                    </td>

                    <td className="py-2 pr-3">
                      <ProductFlagsMenu
                        productId={product.id}
                        flags={{
                          is_new: product.is_new,
                          is_topseller: product.is_topseller,
                        }}
                        customFlags={customFlags}
                        activeCustomFlagIds={product.flags.map((flag) => flag.id)}
                      />
                    </td>

                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          title="Details bearbeiten"
                        >
                          <Link href={`/admin/products/${product.id}/edit`}>
                            <Pencil className="size-4" aria-hidden />
                            <span className="sr-only">
                              {product.name} bearbeiten
                            </span>
                          </Link>
                        </Button>
                        <ConfirmAction
                          action={deleteProduct}
                          fields={{ id: product.id }}
                          title={`„${product.name}“ löschen?`}
                          description="Artikel, Preisstaffeln und hochgeladene Fotos werden entfernt. Bereits erfasste Bestellungen bleiben unverändert."
                          confirmLabel="Löschen"
                          destructive
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Artikel löschen"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" aria-hidden />
                              <span className="sr-only">
                                {product.name} löschen
                              </span>
                            </Button>
                          }
                        />
                      </div>
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
