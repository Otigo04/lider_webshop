import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { ProductFlagBadges } from "@/components/product-flag-badges";
import { RabattBadge, SalePrice } from "@/components/sale-price";
import { formatPrice } from "@/lib/format";
import { reduzierung } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PublicProductListItem } from "@/lib/queries/products";

/**
 * Karte für nicht angemeldete Besucher: kein Preis, kein Bestand – die Daten
 * liegen im PublicProductListItem gar nicht vor (siehe products_public View).
 */
export function PublicProductCard({
  product,
  className,
}: {
  product: PublicProductListItem;
  className?: string;
}) {
  const rabatt = reduzierung(product.list_price, product.priceFrom);

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
        <p className="code text-xs text-muted-foreground">{product.sku}</p>

        <h3 className="mt-2 font-semibold leading-snug group-hover:underline">
          {product.name}
        </h3>

        {product.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        {/*
          Öffentlich sichtbar ist nur der günstigste Stückpreis. Welche Menge
          zu welchem Preis führt, steht erst nach der Anmeldung.
        */}
        <div className="mt-auto border-t border-border pt-3">
          {product.priceFrom !== null ? (
            <>
              {rabatt ? (
                <SalePrice reduktion={rabatt} suffix="/ Stück" />
              ) : (
                <p className="flex items-baseline gap-1">
                  <span className="text-xs text-muted-foreground">ab</span>
                  <span className="text-xl font-bold tabular">
                    {formatPrice(product.priceFrom)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ Stück</span>
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                Staffelpreise nach Anmeldung
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Preis nach Anmeldung</p>
          )}
        </div>
      </div>
    </Link>
  );
}
