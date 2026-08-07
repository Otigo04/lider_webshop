import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { loadShopPage } from "@/lib/queries/shop-page";

export const metadata: Metadata = {
  title: "Sortiment",
  description: "Artikel, Staffelpreise und Bestände im Kundenportal.",
};

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const daten = await loadShopPage({ searchParams: await searchParams });

  return (
    <ShopView
      {...daten}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={null}
      action="/shop"
      heading="Sortiment"
      description={
        daten.istKunde
          ? "Alle Preise netto zzgl. USt. Staffelpreise gelten je Artikel."
          : null
      }
    />
  );
}
