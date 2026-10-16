"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { SiteSearch } from "@/components/site-search";

/**
 * Suche in der Kopfleiste: eine Lupe, die ein Suchband unter der Leiste
 * aufklappt. Ein festes Feld in der Leiste verdrängte bei Admins (sieben
 * Reiter plus Kasse-Knopf) die Nachbarn; die Lupe braucht 36 px und das Band
 * liegt über der ganzen Breite, also konkurriert die Suche nicht um Platz.
 *
 * Nur ab lg – darunter steht die Suche im Klappmenü. Das Formular ist ein
 * normales GET auf /shop; beim Absenden lädt die Seite neu und das Band ist
 * wieder zu, dafür braucht es keinen Effekt.
 */
export function HeaderSearch() {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen((alt) => !alt)}
        aria-expanded={offen}
        aria-controls="kopf-suche"
        aria-label={offen ? "Suche schließen" : "Artikel suchen"}
        className="hidden size-9 items-center justify-center rounded-md text-surface-dark-foreground/85 transition-colors hover:bg-white/10 hover:text-surface-dark-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:flex"
      >
        {offen ? (
          <X className="size-5" aria-hidden />
        ) : (
          <Search className="size-5" aria-hidden />
        )}
      </button>

      {offen ? (
        <div
          id="kopf-suche"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOffen(false);
          }}
          className="absolute inset-x-0 top-full hidden border-b-2 border-gold bg-surface-dark shadow-lg lg:block"
        >
          <div className="mx-auto max-w-6xl px-4 py-3">
            <SiteSearch variant="leiste" className="max-w-xl" autoFocus />
          </div>
        </div>
      ) : null}
    </>
  );
}
