import type { Metadata } from "next";
import { PublicShopView } from "@/components/public-shop-view";
import { ShopView } from "@/components/shop-view";
import { getCurrentUser } from "@/lib/auth";
import {
  getCategories,
  getProducts,
  getPublicProducts,
} from "@/lib/queries/products";

export const metadata: Metadata = {
  title: "Sortiment",
  description: "Artikel, Staffelpreise und Bestände im Kundenportal.",
};

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";

  // Deaktivierte Kunden sehen das Schaufenster wie anonyme Besucher – RLS
  // würde ihnen bei der Kunden-Ansicht ohnehin nur leere Ergebnisse liefern.
  if (!user || !user.is_active) {
    const [categories, products] = await Promise.all([
      getCategories(),
      getPublicProducts({ search }),
    ]);

    return (
      <PublicShopView
        categories={categories}
        products={products}
        activeSlug={null}
        search={search}
        action="/shop"
        heading="Sortiment"
      />
    );
  }

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
