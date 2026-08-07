import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { loadShopPage } from "@/lib/queries/shop-page";

export const metadata: Metadata = { title: "Topseller" };

export default async function TopsellerPage({
  searchParams,
}: PageProps<"/shop/topseller">) {
  const daten = await loadShopPage({
    searchParams: await searchParams,
    flag: "is_topseller",
  });

  return (
    <ShopView
      {...daten}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={null}
      action="/shop/topseller"
      heading="Topseller"
      description="Artikel, die unsere Händler regelmäßig nachbestellen."
      // Der Haken "Nur Topseller" wäre hier ohne Wirkung.
      showFlagFilters={false}
    />
  );
}
