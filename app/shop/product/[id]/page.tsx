import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { MerkmalListe } from "@/components/merkmal-liste";
import { ProductGallery } from "@/components/product-gallery";
import { ProductVariantPicker } from "@/components/product-variant-picker";
import { ProductPurchase } from "@/components/product-purchase";
import { PublicPurchaseCta } from "@/components/public-purchase-cta";
import { StockBadge } from "@/components/stock-badge";
import { getCurrentUser } from "@/lib/auth";
import { freeStock } from "@/lib/pricing";
import { istNeu } from "@/lib/product-flags";
import {
  getProductAttributeValueIds,
  getProductAttributes,
} from "@/lib/queries/attributes";
import { getGroupSiblings } from "@/lib/queries/groups";
import { baueAuswahlfelder } from "@/lib/product-groups";
import { firstImagePath, getProduct, getPublicProduct } from "@/lib/queries/products";
import { getCompanySettings } from "@/lib/queries/settings";

export async function generateMetadata({
  params,
}: PageProps<"/shop/product/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProduct(id);

  if (!product) return { title: "Artikel" };

  /*
   * Beschreibung aus dem Artikeltext, sonst aus den Eckdaten gebaut. Ein
   * Suchergebnis ohne Beschreibung lässt Google sich selbst einen Satz aus
   * der Seite suchen – meist den Brotkrumenpfad.
   */
  const beschreibung = product.description?.trim()
    ? product.description.trim().replace(/\s+/g, " ").slice(0, 300)
    : `${product.name} (Art.-Nr. ${product.sku}) im Großhandelssortiment von LIDER. Staffelpreise und Bestände im Kundenportal.`;

  const pfad = `/shop/product/${product.id}`;

  return {
    title: product.name,
    description: beschreibung,
    alternates: { canonical: pfad },
    openGraph: {
      type: "website",
      title: product.name,
      description: beschreibung,
      url: pfad,
    },
    // Ohne eigenen twitter-Block erbt die Karte Titel und Text der Startseite –
    // geteilt würde dann bei jedem Artikel dasselbe stehen.
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description: beschreibung,
    },
  };
}

export default async function ProductPage({
  params,
}: PageProps<"/shop/product/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user || !user.is_active) {
    const product = await getPublicProduct(id);
    if (!product) notFound();

    // Merkmale stehen auch ohne Anmeldung da: Farbe und Größe sind das, wonach
    // im Schaufenster gesucht wird, und keine Preisauskunft.
    const [merkmale, gesetzteWerte, geschwister] = await Promise.all([
      getProductAttributes(),
      getProductAttributeValueIds(product.id),
      product.group_id ? getGroupSiblings(product.group_id) : [],
    ]);

    /*
     * Bestände sind ohne Anmeldung nicht sichtbar (products_public führt sie
     * gar nicht). Die Auswahl bekommt deshalb `null` statt einer Zahl: sie
     * streicht dann nichts durch, statt alles fälschlich als lieferbar oder
     * als ausverkauft darzustellen.
     */
    const auswahl = baueAuswahlfelder({
      attributes: merkmale,
      ausfuehrungen: geschwister.map((g) => ({
        id: g.id,
        name: g.name,
        valueIds: g.valueIds,
        freeStock: null,
      })),
      aktuelleId: product.id,
    });

    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav
          aria-label="Brotkrumen"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link href="/shop" className="hover:text-foreground">
            Sortiment
          </Link>
          {product.category ? (
            <>
              <ChevronRight className="size-4" aria-hidden />
              <Link
                href={`/shop/${product.category.slug}`}
                className="hover:text-foreground"
              >
                {product.category.name}
              </Link>
            </>
          ) : null}
        </nav>

        <div className="mt-6 grid gap-10 md:grid-cols-2">
          <ProductGallery urls={product.imageUrls} alt={product.name} />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="code rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {product.sku}
              </p>
              {istNeu(product) ? (
                <span className="rounded-md bg-signal px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-signal-foreground">
                  Neu
                </span>
              ) : null}
              {product.is_topseller ? (
                <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gold-foreground">
                  Topseller
                </span>
              ) : null}
            </div>

            {/* Bei einem Bündel trägt die Überschrift den Namen des
                Angebots und die Zeile darunter die gewählte Ausführung: die
                Überschrift soll bei jedem Wechsel stehen bleiben, sonst
                springt sie unter der Auswahl weg, die man gerade bedient. */}
            <h1 className="headline mt-4 text-3xl font-bold sm:text-4xl">
              {product.groupName ?? product.name}
            </h1>
            {product.groupName ? (
              <p className="mt-1 text-muted-foreground">{product.name}</p>
            ) : null}

            {product.description ? (
              <p className="mt-5 whitespace-pre-line leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            ) : null}

            {/* Die Auswahl steht über den Angaben: sie ist eine Frage an den
                Kunden, die Merkmalsliste darunter nur die Auskunft über die
                gerade gewählte Ausführung. */}
            <ProductVariantPicker felder={auswahl} className="mt-6" />

            <MerkmalListe
              attributes={merkmale}
              valueIds={gesetzteWerte}
              className="mt-6"
            />

            <div className="mt-8">
              <PublicPurchaseCta
                priceFrom={product.priceFrom}
                minOrderQuantity={product.minOrderQuantity}
                listPrice={product.list_price}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const product = await getProduct(id);
  // has_image: kein Foto = kein Sortiment (Migration 020), auch nicht über
  // einen direkten Link – gilt hier genauso wie is_active.
  if (!product || !product.is_active || !product.has_image) notFound();

  const free = freeStock(product);
  const [company, merkmale, gesetzteWerte, geschwister] = await Promise.all([
    getCompanySettings(),
    getProductAttributes(),
    getProductAttributeValueIds(product.id),
    product.group_id ? getGroupSiblings(product.group_id) : [],
  ]);

  // Angemeldete Kunden sehen Bestände, also kann die Auswahl durchstreichen,
  // was gerade nicht lieferbar ist – und führt bei mehreren gleich passenden
  // Ausführungen auf die, die noch da ist.
  const auswahl = baueAuswahlfelder({
    attributes: merkmale,
    ausfuehrungen: geschwister.map((g) => ({
      id: g.id,
      name: g.name,
      valueIds: g.valueIds,
      freeStock: g.free,
    })),
    aktuelleId: product.id,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav
        aria-label="Brotkrumen"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/shop" className="hover:text-foreground">
          Sortiment
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="size-4" aria-hidden />
            <Link
              href={`/shop/${product.category.slug}`}
              className="hover:text-foreground"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <ProductGallery urls={product.imageUrls} alt={product.name} />

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="code rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {product.sku}
            </p>
            <StockBadge free={free} />
            {istNeu(product) ? (
              <span className="rounded-md bg-signal px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-signal-foreground">
                Neu
              </span>
            ) : null}
            {product.is_topseller ? (
              <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gold-foreground">
                Topseller
              </span>
            ) : null}
          </div>

          <h1 className="headline mt-4 text-3xl font-bold sm:text-4xl">
            {product.group?.name ?? product.name}
          </h1>
          {product.group ? (
            <p className="mt-1 text-muted-foreground">{product.name}</p>
          ) : null}

          {product.description ? (
            <p className="mt-5 whitespace-pre-line leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          <ProductVariantPicker felder={auswahl} className="mt-6" />

          <MerkmalListe
            attributes={merkmale}
            valueIds={gesetzteWerte}
            className="mt-6"
          />

          <div className="mt-8">
            <ProductPurchase
              productId={product.id}
              productName={product.name}
              productSku={product.sku}
              tiers={product.variants}
              freeStock={free}
              listPrice={product.list_price}
              imagePath={firstImagePath(product.images)}
              vatRate={company.pos_vat_rate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
