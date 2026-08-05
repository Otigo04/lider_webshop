import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchase } from "@/components/product-purchase";
import { StockBadge } from "@/components/stock-badge";
import { requireUser } from "@/lib/auth";
import { freeStock } from "@/lib/pricing";
import { getProduct } from "@/lib/queries/products";

export async function generateMetadata({
  params,
}: PageProps<"/shop/product/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product?.name ?? "Artikel" };
}

export default async function ProductPage({
  params,
}: PageProps<"/shop/product/[id]">) {
  const { id } = await params;
  await requireUser(`/shop/product/${id}`);

  const product = await getProduct(id);
  if (!product || !product.is_active) notFound();

  const free = freeStock(product);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav
        aria-label="Brotkrumen"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/shop" className="hover:text-foreground">
          Sortiment
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="size-4" aria-hidden />
            <Link
              href={`/shop/${product.category.slug}`}
              className="hover:text-foreground"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <ProductGallery urls={product.imageUrls} alt={product.name} />

        <div>
          <p className="text-sm text-muted-foreground tabular">{product.sku}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {product.name}
          </h1>

          <div className="mt-3">
            <StockBadge free={free} />
          </div>

          {product.description ? (
            <p className="mt-6 whitespace-pre-line text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          <div className="mt-8">
            <ProductPurchase
              productId={product.id}
              productName={product.name}
              productSku={product.sku}
              tiers={product.variants}
              freeStock={free}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
