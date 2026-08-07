import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { loadShopPage } from "@/lib/queries/shop-page";

export const metadata: Metadata = { title: "Neuheiten" };

export default async function NeuheitenPage({
  searchParams,
}: PageProps<"/shop/neuheiten">) {
  const daten = await loadShopPage({
    searchParams: await searchParams,
    flag: "is_new",
  });

  return (
    <ShopView
      {...daten}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={null}
      action="/shop/neuheiten"
      heading="Neuheiten"
      description="Zuletzt ins Sortiment aufgenommen."
      // Der Haken "Nur Neuheiten" wäre hier ohne Wirkung.
      showFlagFilters={false}
    />
  );
}
