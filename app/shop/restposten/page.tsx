import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { loadShopPage } from "@/lib/queries/shop-page";

export const metadata: Metadata = {
  title: "Restposten",
  description:
    "Restposten und B-Ware zu Sonderpreisen: Ware mit leichten Verpackungsmängeln und Auslaufartikel – nur solange der Vorrat reicht.",
  alternates: { canonical: "/shop/restposten" },
};

export default async function RestpostenPage({
  searchParams,
}: PageProps<"/shop/restposten">) {
  const daten = await loadShopPage({
    searchParams: await searchParams,
    flag: "is_restposten",
  });

  return (
    <ShopView
      {...daten}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={null}
      action="/shop/restposten"
      heading="Restposten"
      description="B-Ware und Auslaufartikel, z. B. mit leicht beschädigter Verpackung – nur solange der Vorrat reicht."
      showFlagFilters={false}
    />
  );
}
