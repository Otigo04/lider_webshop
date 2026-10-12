import { istNeu } from "@/lib/product-flags";
import { cn } from "@/lib/utils";
import { RESTPOSTEN_WARE_LABELS, type RestpostenWare } from "@/lib/types";

/**
 * Kennzeichnung für Restposten/B-Ware. Anthrazit statt einer Signalfarbe:
 * sie soll sachlich sagen, was die Ware ist, nicht um Aufmerksamkeit
 * konkurrieren – Rot gehört dem Preis, Gold den Topsellern.
 */
export function RestpostenChip({
  className,
  ware,
}: {
  className?: string;
  /** Güteklasse (Migration 070); ohne Angabe steht nur „Restposten". */
  ware?: RestpostenWare | null;
}) {
  return (
    <span
      className={cn(
        "rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm",
        className,
      )}
    >
      Restposten
      {ware ? ` · ${RESTPOSTEN_WARE_LABELS[ware]}` : ""}
    </span>
  );
}

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
  product: {
    is_new: boolean;
    is_topseller: boolean;
    is_restposten?: boolean;
    restposten_ware?: RestpostenWare | null;
    created_at: string;
  };
  className?: string;
}) {
  const neu = istNeu(product);
  if (!neu && !product.is_topseller && !product.is_restposten) return null;

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
      {product.is_restposten ? (
        <RestpostenChip ware={product.restposten_ware} />
      ) : null}
    </div>
  );
}
