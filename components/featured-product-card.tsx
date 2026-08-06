import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { PublicProductListItem } from "@/lib/queries/products";

/** Karte für die Neuheiten-Sektion auf der Landingpage – kompakter als PublicProductCard, mit Badge. */
export function FeaturedProductCard({ product }: { product: PublicProductListItem }) {
  return (
    <Link
      href={`/shop/product/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card hover:border-foreground/25"
    >
      <div className="relative aspect-square border-b border-border bg-muted">
        <span className="absolute left-2 top-2 z-10 rounded-md bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground">
          Neu
        </span>
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 220px, (min-width: 768px) 30vw, 45vw"
            className="object-contain p-4"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
            <span className="sr-only">Kein Foto hinterlegt</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium leading-snug group-hover:underline">
          {product.name}
        </p>
      </div>
    </Link>
  );
}
