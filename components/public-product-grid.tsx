import { PublicProductCard } from "@/components/public-product-card";
import type { PublicProductListItem } from "@/lib/queries/products";

export function PublicProductGrid({
  products,
  emptyMessage = "Keine Artikel gefunden.",
}: {
  products: PublicProductListItem[];
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
      {products.map((product) => (
        <PublicProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
