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
 *   gross  – eigenes helles Band auf der Startseite, zwischen Schnellleiste
 *            und Kopfbereich (beide dunkel): dunkel auf dunkel ging dort
 *            unter, die Suche las sich als Teil der Nachbarn. Helle Fläche,
 *            weißes Feld und ein Suchen-Knopf machen sie zum eigenen Element.
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
          "border-y border-border bg-muted",
          className,
        )}
      >
        <form
          action="/shop"
          method="get"
          role="search"
          className="mx-auto flex max-w-6xl items-stretch gap-2 px-4 py-5"
        >
          <label htmlFor="suche-gross" className="sr-only">
            Artikel suchen
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="suche-gross"
              name="q"
              type="search"
              maxLength={100}
              autoComplete="off"
              placeholder="Artikel suchen – Bezeichnung, Artikelnummer oder Barcode"
              className="h-12 w-full rounded-md border border-input bg-background pl-12 pr-3 text-base text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
            />
          </div>
          <button
            type="submit"
            className="h-12 shrink-0 rounded-md bg-brand px-5 text-base font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
