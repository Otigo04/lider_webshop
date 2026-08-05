import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ProductForm } from "@/components/forms/product-form";
import { getCategories, getProduct } from "@/lib/queries/products";

export async function generateMetadata({
  params,
}: PageProps<"/admin/products/[id]/edit">): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? `${product.name} bearbeiten` : "Artikel" };
}

export default async function EditProductPage({
  params,
}: PageProps<"/admin/products/[id]/edit">) {
  const { id } = await params;

  const [product, categories] = await Promise.all([
    getProduct(id),
    getCategories(),
  ]);
  if (!product) notFound();

  return (
    <div>
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Artikel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {product.name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground tabular">{product.sku}</p>

      <div className="mt-8 max-w-3xl">
        <ProductForm
          categories={categories}
          product={{
            id: product.id,
            category_id: product.category_id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            is_active: product.is_active,
            stock_available: product.stock_available,
            variants: product.variants,
            images: product.images,
          }}
          imageUrls={product.imageUrls}
        />
      </div>
    </div>
  );
}
