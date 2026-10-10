import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ZurueckZurListe } from "@/components/admin/zurueck-zur-liste";
import { ProductForm } from "@/components/forms/product-form";
import {
  getProductAttributeValueIds,
  getProductAttributes,
} from "@/lib/queries/attributes";
import { getProductCost } from "@/lib/queries/admin";
import { getGroupOptions } from "@/lib/queries/groups";
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

  const [product, categories, attributes, attributeValueIds, groupOptions, costPrice] =
    await Promise.all([
      getProduct(id),
      getCategories(),
      getProductAttributes(),
      getProductAttributeValueIds(id),
      getGroupOptions(),
      // Eigene Abfrage, weil getProduct() auch die öffentliche Artikelseite
      // speist – siehe getProductCost().
      getProductCost(id),
    ]);
  if (!product) notFound();

  return (
    <div>
      <ZurueckZurListe className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        Alle Artikel
      </ZurueckZurListe>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {product.name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground tabular">{product.sku}</p>

      <div className="mt-8 max-w-3xl">
        <ProductForm
          categories={categories}
          attributes={attributes}
          attributeValueIds={attributeValueIds}
          groupOptions={groupOptions}
          product={{
            id: product.id,
            category_id: product.category_id,
            group_id: product.group_id,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            description: product.description,
            is_active: product.is_active,
            is_preorder: product.is_preorder,
            preorder_note: product.preorder_note,
            stock_available: product.stock_available,
            retail_price: product.retail_price,
            cost_price: costPrice,
            list_price: product.list_price,
            variants: product.variants,
            images: product.images,
          }}
          imageUrls={product.imageUrls}
        />
      </div>
    </div>
  );
}
