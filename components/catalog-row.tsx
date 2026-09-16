import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ImageOff } from "lucide-react";
import { RabattBadge } from "@/components/sale-price";
import { formatPrice } from "@/lib/format";
import { reduzierung } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PublicProductListItem } from "@/lib/queries/products";

/**
 * Artikel als Listenzeile – für die Neuheiten- und Topseller-Spalten der
 * Startseite. Eine Zeile braucht weniger Platz als eine Karte; so stehen beide
 * Listen nebeneinander, und eine kurze Liste hinterlässt keine leere Bahn.
 */
export function CatalogRow({
  product,
  rang,
  className,
}: {
  product: PublicProductListItem;
  /** Platzziffer vor dem Foto, z. B. bei Topsellern */
  rang?: number;
  className?: string;
}) {
  const rabatt = reduzierung(product.list_price, product.priceFrom);

  return (
    <Link
      href={`/shop/product/${product.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 pr-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-lg",
        className,
      )}
    >
      {rang !== undefined ? (
        <span className="w-5 shrink-0 text-center text-lg font-extrabold text-muted-foreground/60 tabular">
          {rang}
        </span>
      ) : null}
      <span className="relative block size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="64px"
            className="object-contain p-1.5 transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="code block text-[0.6875rem] text-muted-foreground">
          {product.sku}
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium group-hover:underline">
          {product.name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm tabular">
          {product.priceFrom !== null ? (
            rabatt ? (
              <>
                <span className="font-bold text-signal">{formatPrice(rabatt.jetzt)}</span>
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(rabatt.vorher)}
                </span>
                <RabattBadge prozent={rabatt.prozent} className="px-1 py-0 text-[0.6875rem]" />
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">ab</span>
                <span className="font-bold">{formatPrice(product.priceFrom)}</span>
                <span className="text-xs text-muted-foreground">/ Stück netto</span>
              </>
            )
          ) : (
            <span className="text-xs text-muted-foreground">Preis nach Anmeldung</span>
          )}
        </span>
      </span>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </Link>
  );
}
