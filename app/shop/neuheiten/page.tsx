import type { Metadata } from "next";
import { ShopView } from "@/components/shop-view";
import { getShopTexte } from "@/lib/queries/shop-texte";
import { loadShopPage } from "@/lib/queries/shop-page";

export const metadata: Metadata = {
  title: "Neuheiten",
  description:
    "Zuletzt ins Großhandelssortiment aufgenommene Artikel bei LIDER – Spielzeug, Multimedia und Handyzubehör.",
  alternates: { canonical: "/shop/neuheiten" },
};

export default async function NeuheitenPage({
  searchParams,
}: PageProps<"/shop/neuheiten">) {
  const daten = await loadShopPage({
    searchParams: await searchParams,
    flag: "is_new",
  });
  const texte = await getShopTexte();

  return (
    <ShopView
      {...daten}
      products={daten.kundenArtikel}
      publicProducts={daten.besucherArtikel}
      activeSlug={null}
      action="/shop/neuheiten"
      heading="Neuheiten"
      description={texte.neuheiten}
      // Der Haken "Nur Neuheiten" wäre hier ohne Wirkung.
      showFlagFilters={false}
    />
  );
}
