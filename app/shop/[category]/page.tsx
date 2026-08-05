import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopView } from "@/components/shop-view";
import { requireUser } from "@/lib/auth";
import {
  getCategories,
  getCategoryBySlug,
  getProducts,
} from "@/lib/queries/products";

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
  await requireUser(`/shop/${slug}`);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ categoryId: category.id, search }),
  ]);

  return (
    <ShopView
      categories={categories}
      products={products}
      activeSlug={category.slug}
      search={search}
      action={`/shop/${category.slug}`}
      heading={category.name}
      description={category.description}
    />
  );
}
