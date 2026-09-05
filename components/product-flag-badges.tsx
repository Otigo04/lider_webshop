import { istNeu } from "@/lib/product-flags";
import { cn } from "@/lib/utils";

/**
 * Kleine Badge-Chips für Neuheit/Topseller, als Overlay auf dem Artikelfoto.
 *
 * „Neu" wird nicht übergeben, sondern aus Flag und Aufnahmedatum abgeleitet
 * (lib/product-flags.ts) – so tragen frisch aufgenommene Artikel das Label
 * drei Tage lang von selbst.
 */
export function ProductFlagBadges({
  product,
  className,
}: {
  product: { is_new: boolean; is_topseller: boolean; created_at: string };
  className?: string;
}) {
  const neu = istNeu(product);
  if (!neu && !product.is_topseller) return null;

  return (
    // items-start, sonst zieht das breitere Chip das schmalere auf seine Breite.
    <div
      className={cn(
        "absolute left-2 top-2 z-10 flex flex-col items-start gap-1",
        className,
      )}
    >
      {neu ? (
        <span className="rounded-md bg-signal px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-signal-foreground shadow-sm">
          Neu
        </span>
      ) : null}
      {product.is_topseller ? (
        <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gold-foreground shadow-sm">
          Topseller
        </span>
      ) : null}
    </div>
  );
}
