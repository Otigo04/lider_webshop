"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavLink } from "@/components/mobile-nav";

/**
 * Reiter der Kopfleiste für breite Bildschirme.
 *
 * Eigene Client-Komponente, weil der aktive Reiter den Pfad braucht – die
 * Kopfleiste selbst bleibt Server Component und lädt weiter den Nutzer.
 *
 * Vorher trugen die Reiter gedämpftes Grau und unterschieden sich beim
 * Überfahren kaum vom Hintergrund; die Leiste sah aus wie eine Fußnote. Jetzt
 * steht die Schrift in vollem Weiß, und unter jedem Reiter fährt beim
 * Überfahren ein goldener Balken aus der Mitte auf. Beim aktiven Reiter steht
 * er dauerhaft – Farbe allein soll die Information nicht tragen.
 */
export function MainNav({ links }: { links: NavLink[] }) {
  const pfad = usePathname();

  return (
    /* Erst ab lg: zwischen 768 und 1024 px passen Logo, sechs Reiter und
       Benutzermenü nicht nebeneinander – die Leiste lief seitlich aus dem
       Fenster und zog die ganze Seite mit. Dort greift das Klappmenü. */
    <nav className="hidden min-w-0 items-center gap-0.5 lg:flex">
      {links.map((link) => {
        const aktiv =
          link.href === "/"
            ? pfad === "/"
            : pfad === link.href || pfad.startsWith(`${link.href}/`);

        // Die Kasse ist kein Shop-Reiter, sondern der Weg in ein anderes
        // Portal. Sie steht deshalb als goldener Knopf da, nicht als Text.
        if (link.hervorgehoben) {
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={aktiv ? "page" : undefined}
              className={cn(
                "ml-2 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors duration-200",
                aktiv
                  ? "border-gold bg-gold text-gold-foreground"
                  : "border-gold/70 text-gold-bright hover:bg-gold hover:text-gold-foreground",
              )}
            >
              <ScanBarcode className="size-4" aria-hidden />
              {link.label}
            </Link>
          );
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "group relative rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200",
              aktiv
                ? "text-surface-dark-foreground"
                : "text-surface-dark-foreground/80 hover:text-surface-dark-foreground",
            )}
          >
            {/* Fläche und Balken liegen hinter der Schrift, damit beim
                Überfahren nichts springt – nur Deckkraft und Breite ändern
                sich, keine Kästchen kommen dazu. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-md bg-white/10 transition-opacity duration-200",
                aktiv ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            />
            <span className="relative">{link.label}</span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2.5 bottom-1 h-0.5 origin-center rounded-full bg-gold transition-transform duration-300 ease-out",
                aktiv ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
