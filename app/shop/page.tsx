import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { requireUser } from "@/lib/auth";
import { getCategories, getProducts } from "@/lib/queries/products";

export const metadata: Metadata = {
  title: "Sortiment",
  description: "Artikel, Staffelpreise und Bestände im Kundenportal.",
};

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  await requireUser("/shop");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ search }),
  ]);

  return (
    <ShopView
      categories={categories}
      products={products}
      activeSlug={null}
      search={search}
      action="/shop"
      heading="Sortiment"
      description="Alle Preise netto zzgl. USt. Staffelpreise gelten je Artikel."
    />
  );
}
