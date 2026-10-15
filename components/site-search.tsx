import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Allgemeine Artikelsuche. Ein einfaches GET-Formular auf /shop: die Seite
 * liest `q` ohnehin (lib/shop-filters.ts) und sucht wortweise in Name,
 * Artikelnummer und Barcode (lib/search.ts). Funktioniert damit auch ohne
 * JavaScript und für Besucher ohne Konto (Schaufenster, ohne Preise).
 *
 *   leiste – kompakt in der dunklen Kopfleiste
 *   menue  – volle Breite im Klappmenü
 *   gross  – eigenes Band unter der Schnellleiste der Startseite
 */
export function SiteSearch({
  variant,
  className,
}: {
  variant: "leiste" | "gross" | "menue";
  className?: string;
}) {
  const feld = (
    <form action="/shop" method="get" role="search" className="relative w-full">
      <label htmlFor={`suche-${variant}`} className="sr-only">
        Artikel suchen
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-dark-muted"
        aria-hidden
      />
      <input
        id={`suche-${variant}`}
        name="q"
        type="search"
        maxLength={100}
        autoComplete="off"
        placeholder={
          variant === "gross"
            ? "Artikel suchen – Bezeichnung, Artikelnummer oder Barcode"
            : "Artikel suchen"
        }
        className={cn(
          "w-full rounded-md border border-surface-dark-border bg-white/[0.06] pl-9 pr-3 text-surface-dark-foreground placeholder:text-surface-dark-muted focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          variant === "gross" ? "h-12 text-base" : "h-9 text-sm",
        )}
      />
    </form>
  );

  if (variant === "gross") {
    return (
      <div
        className={cn(
          "border-b border-surface-dark-border bg-surface-dark",
          className,
        )}
      >
        <div className="mx-auto max-w-6xl px-4 py-4">{feld}</div>
      </div>
    );
  }

  return <div className={className}>{feld}</div>;
}
