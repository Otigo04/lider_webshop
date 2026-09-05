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
 * Artikelkarte für die Landingpage – kompakter als die PublicProductCard im
 * Sortiment und ohne Beschreibungstext, weil hier mehrere Karten nebeneinander
 * stehen. Preise gibt es hier nicht: die Landingpage ist öffentlich.
 */
export function CatalogCard({
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
        "card-hover group flex flex-col overflow-hidden rounded-md border border-border bg-card hover:border-foreground/30",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden border-b border-border bg-muted">
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
            sizes="(min-width: 1024px) 260px, (min-width: 768px) 33vw, 60vw"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
            <span className="sr-only">Kein Foto hinterlegt</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="code text-xs text-muted-foreground">{product.sku}</p>
        <p className="mt-2 font-medium leading-snug group-hover:underline">
          {product.name}
        </p>

        {/* "Ab"-Preis ohne die Staffeln – die gibt es erst nach Anmeldung. */}
        <div className="mt-auto pt-3">
          {product.priceFrom !== null ? (
            rabatt ? (
              <SalePrice reduktion={rabatt} groesse="kompakt" suffix="/ Stück" />
            ) : (
              <p className="flex items-baseline gap-1">
                <span className="text-xs text-muted-foreground">ab</span>
                <span className="text-lg font-bold tabular">
                  {formatPrice(product.priceFrom)}
                </span>
                <span className="text-xs text-muted-foreground">/ Stück</span>
              </p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Preis nach Anmeldung</p>
          )}
          {product.minOrderQuantity ? (
            <p className="mt-0.5 text-xs text-muted-foreground tabular">
              Abnahme ab {product.minOrderQuantity} Stück
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
