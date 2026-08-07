import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import type { ProductListItem } from "@/lib/queries/products";

export function ProductGrid({
  products,
  emptyMessage = "Keine Artikel gefunden.",
}: {
  products: ProductListItem[];
  emptyMessage?: string;
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {/* Versatz nur über die ersten Reihen, damit lange Listen nicht warten. */}
      {products.map((product, index) => (
        <Reveal key={product.id} delay={(index % 6) * 55} className="flex">
          <ProductCard product={product} className="w-full" />
        </Reveal>
      ))}
    </div>
  );
}
