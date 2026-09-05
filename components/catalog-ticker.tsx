import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { reduzierung } from "@/lib/pricing";
import type { PublicProductListItem } from "@/lib/queries/products";

/**
 * Laufendes Band mit den zuletzt aufgenommenen Artikeln – Foto, Name und
 * "ab"-Preis. Kein Dekor: es zeigt echte Ware aus dem Katalog, und jede Kachel
 * führt direkt zum Artikel.
 *
 * Die zweite Kopie der Liste sorgt für den nahtlosen Umlauf. Sie ist für
 * Screenreader ausgeblendet und aus der Tastaturreihenfolge genommen, führt
 * aber denselben Link wie das Original: über die halbe Umlaufzeit zeigt das
 * Band die Kopie, und wer dort auf eine Kachel klickte, klickte bisher ins
 * Leere – am häufigsten bei frisch angelegter Ware, die vorne steht.
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
  const rabatt = reduzierung(product.list_price, product.priceFrom);

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
          /*
            Auf dem dunklen Band trägt nicht der Preis die Signalfarbe, sondern
            das Prozentbadge: Rot auf Anthrazit liest sich schlecht, Weiß auf
            Rot immer. Der Preis bleibt in Gold wie bei allen anderen Kacheln,
            der Vorher-Preis steht durchgestrichen daneben.
          */
          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm text-gold-bright tabular">
            <span>
              ab {formatPrice(product.priceFrom)}
              <span className="text-surface-dark-muted"> / Stück</span>
            </span>
            {rabatt ? (
              <>
                <span className="text-xs text-surface-dark-muted line-through">
                  {formatPrice(rabatt.vorher)}
                </span>
                <span className="rounded bg-signal px-1 text-[0.6875rem] font-semibold text-signal-foreground">
                  −{rabatt.prozent}&nbsp;%
                </span>
              </>
            ) : null}
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-surface-dark-muted">
            Preis nach Anmeldung
          </span>
        )}
      </span>
    </>
  );

  return (
    <Link
      href={`/shop/product/${product.id}`}
      // Die Kopie ist Füllung für den Umlauf: anklickbar wie das Original,
      // aber kein zweiter Tabstopp und für Screenreader nicht vorhanden.
      tabIndex={kopie ? -1 : undefined}
      className="flex w-[19rem] items-center gap-3 rounded-md border border-surface-dark-border px-3 py-2 transition-colors hover:border-brand hover:bg-white/[0.04]"
    >
      {inhalt}
    </Link>
  );
}
