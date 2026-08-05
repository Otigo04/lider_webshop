import Link from "next/link";
import { Search } from "lucide-react";
import { ProductGrid } from "@/components/product-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/lib/queries/products";
import type { Category } from "@/lib/types";

interface ShopViewProps {
  categories: Category[];
  products: ProductListItem[];
  /** Slug der aktiven Kategorie, null auf der Gesamtübersicht */
  activeSlug: string | null;
  search: string;
  /** Ziel des Suchformulars – bleibt in der aktuellen Kategorie */
  action: string;
  heading: string;
  description?: string | null;
}

export function ShopView({
  categories,
  products,
  activeSlug,
  search,
  action,
  heading,
  description,
}: ShopViewProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {/* Ohne JavaScript nutzbar: normales GET-Formular */}
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

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
        <CategoryPill href="/shop" active={activeSlug === null}>
          Alle Artikel
        </CategoryPill>
        {categories.map((category) => (
          <CategoryPill
            key={category.id}
            href={`/shop/${category.slug}`}
            active={category.slug === activeSlug}
          >
            {category.name}
          </CategoryPill>
        ))}
      </nav>

      <p className="mt-6 text-sm text-muted-foreground tabular">
        {products.length === 1
          ? "1 Artikel"
          : `${products.length} Artikel`}
        {search ? ` für „${search}“` : ""}
      </p>

      <div className="mt-4">
        <ProductGrid
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

function CategoryPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
