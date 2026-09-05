"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavLink } from "@/components/mobile-nav";

/**
 * Reiter der Kopfleiste für breite Bildschirme.
 *
 * Eigene Client-Komponente, weil der aktive Reiter den Pfad braucht – die
 * Kopfleiste selbst bleibt Server Component und lädt weiter den Nutzer.
 * Der aktive Reiter wird nicht nur farbig, sondern bekommt einen goldenen
 * Balken: Farbe allein soll die Information nicht tragen.
 */
export function MainNav({ links }: { links: NavLink[] }) {
  const pfad = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {links.map((link) => {
        const aktiv =
          link.href === "/"
            ? pfad === "/"
            : pfad === link.href || pfad.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
              aktiv
                ? "bg-white/10 text-surface-dark-foreground"
                : "text-surface-dark-muted hover:bg-white/[0.07] hover:text-surface-dark-foreground",
            )}
          >
            {link.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gold transition-transform duration-300",
                aktiv ? "scale-x-100" : "scale-x-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
