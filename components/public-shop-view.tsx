import Link from "next/link";
import { Search } from "lucide-react";
import { CategoryPill } from "@/components/shop-view";
import { PublicProductGrid } from "@/components/public-product-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicProductListItem } from "@/lib/queries/products";
import type { Category } from "@/lib/types";

interface PublicShopViewProps {
  categories: Category[];
  products: PublicProductListItem[];
  /** Slug der aktiven Kategorie, null auf der Gesamtübersicht */
  activeSlug: string | null;
  search: string;
  /** Ziel des Suchformulars – bleibt in der aktuellen Kategorie */
  action: string;
  heading: string;
  description?: string | null;
}

/**
 * Schaufenster-Variante von ShopView für nicht angemeldete Besucher: gleiches
 * Layout (Suche, Kategorie-Filter, Grid), aber ohne Preise/Bestand und mit
 * einem Hinweis, dass Bestellen ein Konto braucht.
 */
export function PublicShopView({
  categories,
  products,
  activeSlug,
  search,
  action,
  heading,
  description,
}: PublicShopViewProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        Sie sehen das Sortiment ohne Preise. Für Staffelpreise, Bestände und
        Bestellungen brauchen Sie ein Kundenkonto.{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Anmelden
        </Link>{" "}
        oder{" "}
        <Link href="/#kontakt" className="font-medium text-foreground underline">
          Zugang anfragen
        </Link>
        .
      </div>

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

        <form action={action} className="flex w-full max-w-sm gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={search}
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

      <nav className="mt-8 flex flex-wrap gap-2 border-b border-border pb-4">
        <CategoryPill href="/shop" active={activeSlug === null}>
          Alle Artikel
        </CategoryPill>
        {categories.map((category) => (
          <CategoryPill
            key={category.id}
            href={`/shop/${category.slug}`}
            active={category.slug === activeSlug}
            code={category.sku_prefix}
          >
            {category.name}
          </CategoryPill>
        ))}
      </nav>

      <p className="mt-6 text-sm text-muted-foreground tabular">
        {products.length === 1 ? "1 Artikel" : `${products.length} Artikel`}
        {search ? ` für „${search}“` : ""}
      </p>

      <div className="mt-4">
        <PublicProductGrid
          products={products}
          emptyMessage={
            search
              ? `Keine Treffer für „${search}“.`
              : "In dieser Kategorie sind noch keine Artikel eingestellt."
          }
        />
      </div>
    </div>
  );
}
