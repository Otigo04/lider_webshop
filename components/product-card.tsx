import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { freeStock, minOrderQuantity, priceRange, reduzierung } from "@/lib/pricing";
import { ProductFlagBadges } from "@/components/product-flag-badges";
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
  // Bezug ist der günstigste erreichbare Stückpreis: gegen den rechnet der
  // Kunde, wenn er die Karte überfliegt.
  const rabatt = reduzierung(product.list_price, range?.from);

  /*
   * Gehört der Artikel zu einer Gruppe, steht deren Name auf der Karte und
   * nicht der der einzelnen Ausführung: im Sortiment liest sich „LED-Lampe
   * E27" besser als „LED-Lampe E27 60 W warmweiß", und daneben stünde sonst
   * dreimal fast dasselbe. Welche Ausführung sich hinter der Kachel verbirgt,
   * verrät die Artikelnummer – ausgewählt wird auf der Artikelseite.
   */
  const ausfuehrungen = product.ausfuehrungen ?? 1;
  const titel = ausfuehrungen > 1 ? (product.group?.name ?? product.name) : product.name;

  return (
    <Link
      href={`/shop/product/${product.id}`}
      className={cn(
        "card-hover group flex flex-col overflow-hidden rounded-md border border-border bg-card hover:border-foreground/25",
        className,
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden border-b border-border bg-muted">
        <ProductFlagBadges product={product} />
        {/* Rechts oben, damit es nicht mit „Neu"/„Topseller" links kollidiert */}
        {rabatt ? (
          <RabattBadge
            prozent={rabatt.prozent}
            className="absolute right-2 top-2 z-10 px-2 py-0.5 shadow-sm"
          />
        ) : null}
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 768px) 45vw, 90vw"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden />
            <span className="sr-only">Kein Foto hinterlegt</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="code text-xs text-muted-foreground">{product.sku}</p>
          <StockBadge free={free} />
        </div>

        <h3 className="mt-2 font-semibold leading-snug group-hover:underline">
          {titel}
        </h3>

        {ausfuehrungen > 1 ? (
          <p className="mt-1 text-xs font-medium text-brand">
            {ausfuehrungen} Ausführungen zur Auswahl
          </p>
        ) : null}

        {product.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        {/* Preisblock unten bündig, damit er über alle Karten auf einer Linie steht */}
        <div className="mt-auto border-t border-border pt-3">
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
                <SalePrice reduktion={rabatt} suffix="/ Stück" className="mt-1" />
              ) : (
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold tabular">
                    {formatPrice(range.from)}
                  </span>
                  {range.to !== null ? (
                    <span className="tabular text-sm text-muted-foreground">
                      – {formatPrice(range.to)}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">/ Stück</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Preis auf Anfrage</p>
          )}
        </div>
      </div>
    </Link>
  );
}
