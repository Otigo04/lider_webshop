import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { freeStock, lowestUnitPrice, minOrderQuantity } from "@/lib/pricing";
import { StockBadge } from "@/components/stock-badge";
import type { ProductListItem } from "@/lib/queries/products";

export function ProductCard({ product }: { product: ProductListItem }) {
  const from = lowestUnitPrice(product.variants);
  const minQty = minOrderQuantity(product.variants);
  const free = freeStock(product);

  return (
    <Link
      href={`/shop/product/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card hover:border-foreground/25"
    >
      <div className="relative aspect-4/3 border-b border-border bg-muted">
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
        <p className="text-xs text-muted-foreground tabular">{product.sku}</p>
        <h3 className="mt-1 font-medium leading-snug group-hover:underline">
          {product.name}
        </h3>

        {product.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        <div className="mt-4 flex items-end justify-between gap-3 pt-2">
          <div>
            {from !== null ? (
              <>
                <p className="text-xs text-muted-foreground">
                  ab {minQty} Stück
                </p>
                <p className="text-lg font-semibold tabular">
                  {formatPrice(from)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / Stück
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Preis auf Anfrage</p>
            )}
          </div>
          <StockBadge free={free} />
        </div>
      </div>
    </Link>
  );
}
