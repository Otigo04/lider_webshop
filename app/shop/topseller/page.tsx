import type { Metadata } from "next";
import { PublicShopView } from "@/components/public-shop-view";
import { ShopView } from "@/components/shop-view";
import { getCurrentUser } from "@/lib/auth";
import {
  getCategories,
  getProducts,
  getPublicProducts,
} from "@/lib/queries/products";

export const metadata: Metadata = { title: "Topseller" };

export default async function TopsellerPage({
  searchParams,
}: PageProps<"/shop/topseller">) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";

  if (!user || !user.is_active) {
    const [categories, products] = await Promise.all([
      getCategories(),
      getPublicProducts({ flag: "is_topseller", search }),
    ]);

    return (
      <PublicShopView
        categories={categories}
        products={products}
        activeSlug={null}
        search={search}
        action="/shop/topseller"
        heading="Topseller"
        description="Meistbestellte Artikel."
      />
    );
  }

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ flag: "is_topseller", search }),
  ]);

  return (
    <ShopView
      categories={categories}
      products={products}
      activeSlug={null}
      search={search}
      action="/shop/topseller"
      heading="Topseller"
      description="Meistbestellte Artikel. Alle Preise netto zzgl. USt."
    />
  );
}
