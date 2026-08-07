import Link from "next/link";
import { Search } from "lucide-react";
import { ProductGrid } from "@/components/product-grid";
import { PublicProductGrid } from "@/components/public-product-grid";
import { ShopFilterPanel, type FilterCategory } from "@/components/shop-filter-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildShopHref, type ShopFilters } from "@/lib/shop-filters";
import type { ProductListItem, PublicProductListItem } from "@/lib/queries/products";

interface ShopViewProps {
  categories: FilterCategory[];
  /** Artikel mit Staffelpreisen und Bestand – nur für angemeldete Kunden */
  products?: ProductListItem[];
  /** Schaufenster-Artikel mit "ab"-Preis, für alle anderen */
  publicProducts?: PublicProductListItem[];
  istKunde: boolean;
  filters: ShopFilters;
  totalCount: number;
  /** Slug der aktiven Kategorie, null auf der Gesamtübersicht */
  activeSlug: string | null;
  /** Ziel der Formulare – bleibt in der aktuellen Ansicht */
  action: string;
  heading: string;
  description?: string | null;
  /** Auf /shop/neuheiten und /shop/topseller wären die Haken sinnlos */
  showFlagFilters?: boolean;
}

/**
 * Sortiment mit Filterspalte links und Artikelraster rechts.
 *
 * Angemeldete Kunden und Besucher bekommen dieselbe Struktur, nur andere
 * Karten: mit Staffelpreisen und Bestand beziehungsweise mit "ab"-Preis. Der
 * Unterschied steckt allein in der Rasterkomponente, damit Filter, Suche und
 * Zählung nicht doppelt gepflegt werden müssen.
 */
export function ShopView({
  categories,
  products = [],
  publicProducts = [],
  istKunde,
  filters,
  totalCount,
  activeSlug,
  action,
  heading,
  description,
  showFlagFilters = true,
}: ShopViewProps) {
  const anzahl = istKunde ? products.length : publicProducts.length;
  const eingeschraenkt = anzahl !== totalCount;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {istKunde ? null : (
        <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Sie sehen die Artikel mit dem günstigsten Stückpreis. Staffelpreise,
          Bestände und Bestellungen brauchen ein Kundenkonto.{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            Anmelden
          </Link>{" "}
          oder{" "}
          <Link href="/#kontakt" className="font-medium text-foreground underline">
            Zugang anfragen
          </Link>
          .
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Sortiment</p>
          <h1 className="headline mt-2 text-3xl font-bold">{heading}</h1>
          {description ? (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {/* Eigenes Formular, damit sich die Suche mit der Eingabetaste
            abschicken lässt. Gesetzte Filter reisen als versteckte Felder mit,
            sonst wären sie nach jeder Suche weg. */}
        <form action={action} className="flex w-full max-w-sm gap-2">
          <FilterFelder filters={filters} />
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={filters.search}
              placeholder="Artikel oder Artikelnummer"
              aria-label="Sortiment durchsuchen"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Suchen
          </Button>
        </form>
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-10">
        <ShopFilterPanel
          categories={categories}
          activeSlug={activeSlug}
          filters={filters}
          action={action}
          showStockFilter={istKunde}
          showFlagFilters={showFlagFilters}
          totalCount={totalCount}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground tabular">
            {anzahl === 1 ? "1 Artikel" : `${anzahl} Artikel`}
            {filters.search ? ` für „${filters.search}“` : ""}
            {eingeschraenkt ? ` von ${totalCount}` : ""}
          </p>

          <div className="mt-4">
            {istKunde ? (
              <ProductGrid products={products} emptyMessage={leerText(filters)} />
            ) : (
              <PublicProductGrid
                products={publicProducts}
                emptyMessage={leerText(filters)}
              />
            )}
          </div>

          {anzahl === 0 ? (
            <div className="mt-4 text-center">
              <Button asChild variant="outline" size="sm">
                <Link href={buildShopHref("/shop", filters, ohneFilter())}>
                  Alle Artikel anzeigen
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function leerText(filters: ShopFilters): string {
  if (filters.search) return `Keine Treffer für „${filters.search}“.`;
  return "Kein Artikel passt zu dieser Auswahl.";
}

function ohneFilter() {
  return {
    q: null,
    preis_min: null,
    preis_max: null,
    menge_max: null,
    neu: null,
    top: null,
    lager: null,
  };
}

function FilterFelder({ filters }: { filters: ShopFilters }) {
  return (
    <>
      {filters.sort !== "name" ? (
        <input type="hidden" name="sort" value={filters.sort} />
      ) : null}
      {filters.priceMin !== null ? (
        <input type="hidden" name="preis_min" value={filters.priceMin} />
      ) : null}
      {filters.priceMax !== null ? (
        <input type="hidden" name="preis_max" value={filters.priceMax} />
      ) : null}
      {filters.maxMinQuantity !== null ? (
        <input type="hidden" name="menge_max" value={filters.maxMinQuantity} />
      ) : null}
      {filters.onlyNew ? <input type="hidden" name="neu" value="1" /> : null}
      {filters.onlyTopseller ? <input type="hidden" name="top" value="1" /> : null}
      {filters.onlyAvailable ? <input type="hidden" name="lager" value="1" /> : null}
    </>
  );
}
