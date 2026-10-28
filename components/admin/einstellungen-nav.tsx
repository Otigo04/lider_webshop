"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface EinstellungenEintrag {
  href: string;
  label: string;
  /** Eine Zeile darunter: was man dort bearbeitet */
  hinweis: string;
}

/**
 * Menü der Einstellungen: links untereinander ab lg, darüber als
 * umbrechende Reihe auf schmalen Schirmen. Aktiv ist der genaue Pfad –
 * /admin/settings ist die Firmenseite und soll nicht bei jeder Unterseite
 * mitleuchten.
 */
export function EinstellungenNav({
  eintraege,
  label = "Einstellungen",
}: {
  eintraege: EinstellungenEintrag[];
  /** Name der Navigation für Screenreader */
  label?: string;
}) {
  const pfad = usePathname();

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-1 lg:sticky lg:top-24 lg:w-60 lg:shrink-0 lg:flex-col lg:self-start"
    >
      {eintraege.map((eintrag) => {
        const aktiv = pfad === eintrag.href;
        return (
          <Link
            key={eintrag.href}
            href={eintrag.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors lg:py-2.5",
              aktiv
                ? "bg-brand font-medium text-brand-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="block">{eintrag.label}</span>
            <span
              className={cn(
                "hidden text-xs lg:block",
                aktiv ? "text-brand-foreground/75" : "text-muted-foreground/80",
              )}
            >
              {eintrag.hinweis}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
