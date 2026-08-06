import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { PublicProductListItem } from "@/lib/queries/products";

/**
 * Karte für nicht angemeldete Besucher: kein Preis, kein Bestand – die Daten
 * liegen im PublicProductListItem gar nicht vor (siehe products_public View).
 */
export function PublicProductCard({ product }: { product: PublicProductListItem }) {
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
        <p className="code text-xs text-muted-foreground">{product.sku}</p>

        <h3 className="mt-2 font-semibold leading-snug group-hover:underline">
          {product.name}
        </h3>

        {product.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        <p className="mt-auto border-t border-border pt-3 text-sm text-muted-foreground">
          Preis nach Anmeldung
        </p>
      </div>
    </Link>
  );
}
