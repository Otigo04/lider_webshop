import { BildVorschau, VORSCHAU_KACHEL_MS } from "@/components/bild-vorschau";
import { ShopImage } from "@/components/shop-image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  freeStock,
  istVorbestellbar,
  minOrderQuantity,
  priceRange,
  reduzierung,
} from "@/lib/pricing";
import {
  AusverkauftBand,
  VorbestellBand,
  ausverkauftBild,
} from "@/components/ausverkauft-band";
import { MerkButton } from "@/components/merk-button";
import { ProductFlagBadges } from "@/components/product-flag-badges";
import { QuickAddButton } from "@/components/quick-add-button";
import { RabattBadge, SalePrice } from "@/components/sale-price";
import { StockBadge } from "@/components/stock-badge";
import type { ProductListItem } from "@/lib/queries/products";

export function ProductCard({
  product,
  className,
}: {
  product: ProductListItem;
  className?: string;
}) {
  const range = priceRange(product.variants);
  const minQty = minOrderQuantity(product.variants);
  const free = freeStock(product);
  const vorbestellbar = istVorbestellbar(product);
  const ausverkauft = free <= 0 && !vorbestellbar;
  // Bezug ist der günstigste erreichbare Stückpreis: gegen den rechnet der
  // Kunde, wenn er die Karte überfliegt.
  const rabatt = reduzierung(product.list_price, range?.from, product.retail_price);

  /*
   * Gehört der Artikel zu einer Gruppe, steht deren Name auf der Karte und
   * nicht der der einzelnen Ausführung: im Sortiment liest sich „LED-Lampe
   * E27" besser als „LED-Lampe E27 60 W warmweiß", und daneben stünde sonst
   * dreimal fast dasselbe. Welche Ausführung sich hinter der Kachel verbirgt,
   * verrät die Artikelnummer – ausgewählt wird auf der Artikelseite.
   */
  const ausfuehrungen = product.ausfuehrungen ?? 1;
  const titel =
    ausfuehrungen > 1 ? (product.group?.name ?? product.name) : product.name;
  // Bei einem Angebot mit Ausführungen muss erst gewählt werden, welche.
  const schnellKauf = ausfuehrungen === 1 && range !== null && (vorbestellbar || free >= minQty);

  return (
    // Das Herz steht neben dem Link, nicht darin (siehe MerkButton). Es sitzt
    // unten rechts auf dem Foto; dessen Höhe folgt der Kartenbreite, deshalb
    // der Container und cqw statt einer festen Pixelzahl.
    <div className={cn("card-hover @container relative flex", className)}>
      <Link
        href={`/shop/product/${product.id}`}
        className="group flex w-full flex-col overflow-hidden rounded-md border border-border bg-card hover:border-foreground/25"
      >
        <BildVorschau
          src={product.imageUrl}
          alt={product.name}
          verzoegerung={VORSCHAU_KACHEL_MS}
          className="relative aspect-4/3 overflow-hidden border-b border-border bg-muted"
        >
          <ProductFlagBadges product={product} />
          {/* Rechts oben, damit es nicht mit „Neu"/„Topseller" links kollidiert */}
          {rabatt ? (
            <RabattBadge
              prozent={rabatt.prozent}
              className="absolute right-2 top-2 z-10 px-2 py-0.5 shadow-sm"
            />
          ) : null}
          {product.imageUrl ? (
            <ShopImage
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 768px) 45vw, 50vw"
              className={cn(
                "object-contain p-2 sm:p-4 transition-transform duration-500 group-hover:scale-[1.04]",
                ausverkauft && ausverkauftBild,
              )}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-8" aria-hidden />
              <span className="sr-only">Kein Foto hinterlegt</span>
            </div>
          )}
          {ausverkauft ? <AusverkauftBand /> : null}
          {vorbestellbar ? <VorbestellBand /> : null}
        </BildVorschau>

        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="code text-xs text-muted-foreground">{product.sku}</p>
            {/* Ausverkauft und Vorbestellbar sagt schon das Band auf dem Foto. */}
            {ausverkauft || vorbestellbar ? null : <StockBadge free={free} />}
          </div>

          <h3 className="mt-2 text-sm font-semibold leading-snug group-hover:underline sm:text-base">
            {titel}
          </h3>

          {ausfuehrungen > 1 ? (
            <p className="mt-1 text-xs font-medium text-brand">
              {ausfuehrungen} Ausführungen zur Auswahl
            </p>
          ) : null}

          {/* max-sm:hidden statt hidden + sm:block: sm:block überschriebe das
              display:-webkit-box von line-clamp, und die Beschreibung stünde
              ungekürzt da. */}
          {product.description ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground max-sm:hidden">
              {product.description}
            </p>
          ) : null}

          {/* Preisblock unten bündig, damit er über alle Karten auf einer Linie steht */}
          <div className={cn("mt-auto border-t border-border pt-3", schnellKauf && "pr-10 sm:pr-12")}>
            {range ? (
              <>
                {/* Die Mindestmenge steht nur dort, wo sie eine Auflage ist –
                  „ab 1 Stück" ist keine Information, sondern Zeilenrauschen. */}
                <p className="eyebrow text-muted-foreground">
                  {range.to !== null
                    ? minQty > 1
                      ? `${product.variants.length} Staffeln · ab ${minQty} Stück`
                      : `${product.variants.length} Staffeln`
                    : minQty > 1
                      ? `ab ${minQty} Stück`
                      : "Stückpreis"}
                </p>
                {/*
                 * Bei mehreren Staffeln die Spanne von günstig nach teuer:
                 * der erreichbare Bestpreis steht vorn. Ist der Artikel
                 * reduziert, tritt die Spanne zurück – dann zählt der eine
                 * Preis gegen den Vorher-Preis.
                 */}
                {rabatt ? (
                  <SalePrice
                    reduktion={rabatt}
                    suffix="/ Stück"
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1 flex items-baseline gap-1">
                    <span className="text-lg font-bold tabular sm:text-xl">
                      {formatPrice(range.from)}
                    </span>
                    {range.to !== null ? (
                      <span className="tabular text-sm text-muted-foreground">
                        – {formatPrice(range.to)}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      / Stück
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Preis auf Anfrage</p>
            )}
          </div>
        </div>
      </Link>
      <MerkButton
        productId={product.id}
        name={product.name}
        className="absolute right-2 top-[calc(75cqw-2.75rem)] z-10"
      />
      {/* Neben dem Link wie das Herz: ein Knopf in einem <a> ist ungültig. */}
      {schnellKauf ? (
        <QuickAddButton
          productId={product.id}
          productName={product.name}
          productSku={product.sku}
          tiers={product.variants}
          freeStock={free}
          vorbestellung={vorbestellbar ? { hinweis: product.preorder_note } : null}
          imagePath={product.imagePath ?? null}
          className="absolute bottom-3 right-3 z-10 size-9 sm:bottom-4 sm:right-4 sm:size-10"
        />
      ) : null}
    </div>
  );
}
