import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopView } from "@/components/shop-view";
import { getCategoryBySlug } from "@/lib/queries/products";
import { loadShopPage } from "@/lib/queries/shop-page";

export async function generateMetadata({
  params,
}: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  return { title: category?.name ?? "Kategorie" };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/shop/[category]">) {
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const daten = await loadShopPage({
    searchParams: await searchParams,
    categoryId: category.id,
  });

  // In der Kategorie zählt die Kategorie, nicht der Gesamtkatalog.
  const gesamt =
    daten.categories.find((eintrag) => eintrag.id === category.id)?.productCount ??
    0;

  return (
    <ShopView
      {...daten}
      totalCount={gesamt}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={category.slug}
      action={`/shop/${category.slug}`}
      heading={category.name}
      description={category.description}
    />
  );
}
