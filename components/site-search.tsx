import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Allgemeine Artikelsuche. Ein einfaches GET-Formular auf /shop: die Seite
 * liest `q` ohnehin (lib/shop-filters.ts) und sucht wortweise in Name,
 * Artikelnummer und Barcode (lib/search.ts). Funktioniert damit auch ohne
 * JavaScript und für Besucher ohne Konto (Schaufenster, ohne Preise).
 *
 *   leiste – im aufklappbaren Suchband unter der dunklen Kopfleiste
 *   menue  – volle Breite im Klappmenü
 *   gross  – Startseite, direkt unter dem laufenden Katalogband und in dessen
 *            dunklen Farben: beide lesen sich als ein Block. Feld mit sichtbarem
 *            Rand und goldener Suchen-Knopf wie in der Kopfleiste, damit die
 *            Suche nicht im Hintergrund verschwindet.
 */
export function SiteSearch({
  variant,
  className,
  autoFocus = false,
}: {
  variant: "leiste" | "gross" | "menue";
  className?: string;
  /** Cursor beim Einblenden ins Feld setzen (aufgeklapptes Suchband) */
  autoFocus?: boolean;
}) {
  if (variant === "gross") {
    return (
      <div
        className={cn(
          "border-b border-surface-dark-border bg-surface-dark",
          className,
        )}
      >
        <form
          action="/shop"
          method="get"
          role="search"
          className="mx-auto flex max-w-6xl items-stretch gap-2 px-4 pb-6 pt-2"
        >
          <label htmlFor="suche-gross" className="sr-only">
            Artikel suchen
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-surface-dark-muted"
              aria-hidden
            />
            <input
              id="suche-gross"
              name="q"
              type="search"
              maxLength={100}
              autoComplete="off"
              placeholder="Artikel suchen – Bezeichnung, Artikelnummer oder Barcode"
              className="h-12 w-full rounded-md border border-white/25 bg-white/10 pl-12 pr-3 text-base text-surface-dark-foreground placeholder:text-surface-dark-muted focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
            />
          </div>
          <button
            type="submit"
            className="h-12 shrink-0 rounded-md bg-gold px-5 text-base font-semibold text-gold-foreground transition-colors duration-200 hover:bg-gold/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Suchen
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={className}>
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
          autoFocus={autoFocus}
          placeholder="Artikel suchen"
          className="h-9 w-full rounded-md border border-white/25 bg-white/10 pl-9 pr-3 text-sm text-surface-dark-foreground placeholder:text-surface-dark-muted focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        />
      </form>
    </div>
  );
}
