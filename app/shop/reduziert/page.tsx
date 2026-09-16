import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { loadShopPage } from "@/lib/queries/shop-page";

export const metadata: Metadata = {
  title: "Reduziert",
  description:
    "Reduzierte Artikel bei LIDER – Spielzeug, Multimedia und Handyzubehör zum gesenkten Preis.",
  alternates: { canonical: "/shop/reduziert" },
};

/*
 * Anders als Neuheiten und Topseller ist „reduziert" kein Flag am Artikel,
 * sondern das Ergebnis von reduzierung() über Vorher-Preis und Staffeln. Die
 * Route setzt deshalb den Filter statt eines Flags in der Abfrage.
 */
export default async function ReduziertPage({
  searchParams,
}: PageProps<"/shop/reduziert">) {
  const daten = await loadShopPage({
    searchParams: { ...(await searchParams), rabatt: "1" },
  });

  return (
    <ShopView
      {...daten}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={null}
      action="/shop/reduziert"
      heading="Reduziert"
      description="Artikel mit gesenktem Preis – solange der Vorrat reicht."
      showFlagFilters={false}
    />
  );
}
