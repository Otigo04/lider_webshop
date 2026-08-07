import { cn } from "@/lib/utils";

/** Kleine Badge-Chips für Neuheit/Topseller, als Overlay auf dem Artikelfoto. */
export function ProductFlagBadges({
  isNew,
  isTopseller,
  className,
}: {
  isNew: boolean;
  isTopseller: boolean;
  className?: string;
}) {
  if (!isNew && !isTopseller) return null;

  return (
    // items-start, sonst zieht das breitere Chip das schmalere auf seine Breite.
    <div
      className={cn(
        "absolute left-2 top-2 z-10 flex flex-col items-start gap-1",
        className,
      )}
    >
      {isNew ? (
        <span className="rounded-md bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground">
          Neu
        </span>
      ) : null}
      {isTopseller ? (
        <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background">
          Topseller
        </span>
      ) : null}
    </div>
  );
}
