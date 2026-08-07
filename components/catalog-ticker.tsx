import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { PublicProductListItem } from "@/lib/queries/products";

/**
 * Laufendes Band mit den zuletzt aufgenommenen Artikeln – Foto, Name und
 * "ab"-Preis. Kein Dekor: es zeigt echte Ware aus dem Katalog, und jede Kachel
 * führt direkt zum Artikel.
 *
 * Die zweite Kopie der Liste sorgt für den nahtlosen Umlauf und ist für
 * Screenreader ausgeblendet; sie enthält auch keine Links, damit die
 * Tastaturreihenfolge nicht doppelt durchläuft.
 *
 * Läuft ohne JavaScript (reine CSS-Animation), hält beim Draufzeigen an und
 * steht still, wenn der Besucher reduzierte Bewegung eingestellt hat.
 */
export function CatalogTicker({ items }: { items: PublicProductListItem[] }) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Zuletzt ins Sortiment aufgenommen"
      className="overflow-hidden border-y border-surface-dark-border bg-surface-dark py-4"
    >
      <div className="ticker">
        <div className="ticker-track">
          <TickerGroup items={items} />
          <TickerGroup items={items} kopie />
        </div>
      </div>
    </section>
  );
}

function TickerGroup({
  items,
  kopie,
}: {
  items: PublicProductListItem[];
  kopie?: boolean;
}) {
  return (
    <ul className="flex shrink-0 items-stretch" aria-hidden={kopie}>
      {items.map((product) => (
        <li key={product.id} className="px-2">
          <TickerCard product={product} kopie={kopie} />
        </li>
      ))}
    </ul>
  );
}

function TickerCard({
  product,
  kopie,
}: {
  product: PublicProductListItem;
  kopie?: boolean;
}) {
  const inhalt = (
    <>
      <span className="relative block size-16 shrink-0 overflow-hidden rounded bg-white">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="64px"
            className="object-contain p-1"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-surface-dark-muted">
            <ImageOff className="size-4" aria-hidden />
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span className="code block text-[0.6875rem] text-surface-dark-muted">
          {product.sku}
        </span>
        <span className="mt-0.5 block max-w-[13rem] truncate text-sm font-medium text-surface-dark-foreground">
          {product.name}
        </span>
        {product.priceFrom !== null ? (
          <span className="mt-0.5 block text-sm text-brand tabular">
            ab {formatPrice(product.priceFrom)}
            <span className="text-surface-dark-muted"> / Stück</span>
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-surface-dark-muted">
            Preis nach Anmeldung
          </span>
        )}
      </span>
    </>
  );

  const klassen =
    "flex w-[19rem] items-center gap-3 rounded-md border border-surface-dark-border px-3 py-2";

  // Die Kopie ist reine Fülllung für den Umlauf – kein zweiter Tabstopp.
  if (kopie) return <span className={klassen}>{inhalt}</span>;

  return (
    <Link
      href={`/shop/product/${product.id}`}
      className={`${klassen} transition-colors hover:border-brand hover:bg-white/[0.04]`}
    >
      {inhalt}
    </Link>
  );
}
