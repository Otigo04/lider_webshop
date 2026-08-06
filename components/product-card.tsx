import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { freeStock, minOrderQuantity, priceRange } from "@/lib/pricing";
import { ProductFlagBadges } from "@/components/product-flag-badges";
import { StockBadge } from "@/components/stock-badge";
import type { ProductListItem } from "@/lib/queries/products";

export function ProductCard({ product }: { product: ProductListItem }) {
  const range = priceRange(product.variants);
  const minQty = minOrderQuantity(product.variants);
  const free = freeStock(product);

  return (
    <Link
      href={`/shop/product/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card hover:border-foreground/25"
    >
      <div className="relative aspect-4/3 border-b border-border bg-muted">
        <ProductFlagBadges isNew={product.is_new} isTopseller={product.is_topseller} />
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 768px) 45vw, 90vw"
            className="object-contain p-4"
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
          {product.name}
        </h3>

        {product.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        {/* Preisblock unten bündig, damit er über alle Karten auf einer Linie steht */}
        <div className="mt-auto border-t border-border pt-3">
          {range ? (
            <>
              <p className="eyebrow text-muted-foreground">
                {range.to !== null
                  ? `${product.variants.length} Staffeln · ab ${minQty} Stück`
                  : `ab ${minQty} Stück`}
              </p>
              {/*
               * Bei mehreren Staffeln die Spanne von günstig nach teuer:
               * der erreichbare Bestpreis steht vorn.
               */}
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
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Preis auf Anfrage</p>
          )}
        </div>
      </div>
    </Link>
  );
}
