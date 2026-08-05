import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { StockBadge } from "@/components/stock-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteProduct } from "@/lib/actions/admin-products";
import { formatPrice, formatQuantity } from "@/lib/format";
import { freeStock, lowestUnitPrice } from "@/lib/pricing";
import { getAdminProducts } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Artikel" };

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const products = await getAdminProducts(search);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Artikel</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {products.length === 1 ? "1 Artikel" : `${products.length} Artikel`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/products" className="flex gap-2">
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
            <Button type="submit" variant="secondary">
              Suchen
            </Button>
          </form>

          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="size-4" /> Neuer Artikel
            </Link>
          </Button>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {search
            ? `Keine Treffer für „${search}“.`
            : "Noch keine Artikel angelegt."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Artikelnummer</th>
                <th className="py-2 pr-4 font-medium">Bezeichnung</th>
                <th className="py-2 pr-4 font-medium">Kategorie</th>
                <th className="py-2 pr-4 font-medium">Staffeln</th>
                <th className="py-2 pr-4 text-right font-medium">ab</th>
                <th className="py-2 pr-4 font-medium">Bestand</th>
                <th className="py-2 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const from = lowestUnitPrice(product.variants ?? []);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-4 tabular">{product.sku}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      {!product.is_active ? (
                        <span className="ml-2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          ausgeblendet
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {product.category?.name ?? "–"}
                    </td>
                    <td className="py-3 pr-4 tabular text-muted-foreground">
                      {formatQuantity(product.variants?.length ?? 0)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular">
                      {from !== null ? formatPrice(from) : "–"}
                    </td>
                    <td className="py-3 pr-4">
                      <StockBadge free={freeStock(product)} />
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/products/${product.id}/edit`}>
                            Bearbeiten
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
                            <Button variant="ghost" size="sm">
                              Löschen
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
