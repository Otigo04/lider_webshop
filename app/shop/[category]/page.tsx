import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeSlider } from "@/components/home-slider";
import { ShopView } from "@/components/shop-view";
import { getActiveCategoryBanners } from "@/lib/queries/category-banners";
import { getCategoryBySlug } from "@/lib/queries/products";
import { loadShopPage } from "@/lib/queries/shop-page";
import { getPublicContact } from "@/lib/queries/settings";
import { slideLink } from "@/lib/slide-form";

export async function generateMetadata({
  params,
}: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  /*
   * Nicht vorhanden: die Seite zeigt gleich die 404-Tafel, der HTTP-Status
   * bleibt aber 200. Grund ist das loading.tsx dieses Abschnitts – es öffnet
   * eine Suspense-Grenze, Next schickt den Rahmen sofort los, und wenn
   * notFound() greift, sind die Kopfzeilen längst raus. Ohne `noindex` nähme
   * eine Suchmaschine die leere Seite als gültige Adresse auf.
   */
  if (!category) {
    return { title: "Warengruppe nicht gefunden", robots: { index: false, follow: false } };
  }

  return {
    title: category.name,
    description:
      category.description?.trim() ||
      `${category.name} im Großhandelssortiment von LIDER. Staffelpreise und Bestände im Kundenportal.`,
    alternates: { canonical: `/shop/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/shop/[category]">) {
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [daten, banner, firma] = await Promise.all([
    loadShopPage({
      searchParams: await searchParams,
      categoryId: category.id,
    }),
    getActiveCategoryBanners(category.id),
    getPublicContact(),
  ]);

  // In der Kategorie zählt die Kategorie, nicht der Gesamtkatalog.
  const gesamt =
    daten.categories.find((eintrag) => eintrag.id === category.id)?.productCount ??
    0;

  return (
    <>
      {/* Banner der Warengruppe (Migration 075, gepflegt unter
          /admin/startseite/gruppen). Ohne laufendes Banner fällt der Block
          ganz weg – kein Platzhalter. */}
      {banner.length > 0 ? (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <div className="overflow-hidden rounded-md border border-border">
            <HomeSlider
              format="gruppe"
              slides={banner.map((b) => ({
                id: b.id,
                title: b.title,
                subtitle: b.subtitle,
                ctaLabel: b.cta_label,
                href: slideLink(b.link_url, firma.email, b.title),
                imageUrl: b.imageUrl!,
                mobileImageUrl: b.mobileImageUrl,
                tone: b.tone,
              }))}
            />
          </div>
        </div>
      ) : null}
      <ShopView
        {...daten}
        totalCount={gesamt}
        products={daten.kundenArtikel}
        publicProducts={daten.besucherArtikel}
        activeSlug={category.slug}
        action={`/shop/${category.slug}`}
        heading={category.name}
        description={category.description}
      />
    </>
  );
}
