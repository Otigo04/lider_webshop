"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Menü für schmale Bildschirme.
 *
 * Statt eines kleinen Dropdowns ein Panel über die volle Breite: auf dem Handy
 * ist Platz das einzige, wovon es genug gibt, und Einträge mit Daumengröße
 * trifft man auch in Bewegung. Die Einträge laufen beim Öffnen versetzt ein,
 * das zeigt die Richtung an, ohne zu bremsen.
 *
 * Zustandsführung von Hand statt über eine Menü-Bibliothek, weil hier genau
 * drei Dinge nötig sind: Escape schließt, der Hintergrund scrollt nicht mit,
 * und ein Seitenwechsel räumt auf.
 */
export function MobileNav({
  links,
  angemeldet,
}: {
  links: NavLink[];
  angemeldet: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const pfad = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;

    function beiTaste(event: KeyboardEvent) {
      if (event.key === "Escape") setOffen(false);
    }

    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", beiTaste);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = vorher;
      document.removeEventListener("keydown", beiTaste);
    };
  }, [offen]);

  if (links.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        aria-label="Menü öffnen"
        aria-expanded={offen}
        className="flex size-9 items-center justify-center rounded-md text-surface-dark-muted transition-colors hover:bg-white/10 hover:text-surface-dark-foreground"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {offen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setOffen(false)}
            className="menu-backdrop absolute inset-0 bg-black/60"
          />

          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Hauptmenü"
            className="menu-panel absolute inset-x-0 top-0 bg-surface-dark text-surface-dark-foreground shadow-2xl outline-none"
          >
            <div className="flex h-14 items-center justify-between border-b border-surface-dark-border px-4">
              <span className="text-base font-semibold tracking-[0.14em]">
                LIDER BERLIN
              </span>
              <button
                type="button"
                onClick={() => setOffen(false)}
                aria-label="Menü schließen"
                className="flex size-9 items-center justify-center rounded-md text-surface-dark-muted transition-colors hover:bg-white/10 hover:text-surface-dark-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <nav className="px-2 py-2">
              {links.map((link, index) => {
                const aktiv = pfad === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={aktiv ? "page" : undefined}
                    // Direkt beim Antippen schließen: sonst stünde das Panel
                    // noch über der neuen Seite.
                    onClick={() => setOffen(false)}
                    style={{ animationDelay: `${40 + index * 45}ms` }}
                    className={cn(
                      "menu-item group flex items-center justify-between gap-4 rounded-md px-4 py-4 text-lg transition-colors",
                      aktiv
                        ? "bg-white/[0.06] text-surface-dark-foreground"
                        : "text-surface-dark-muted hover:bg-white/[0.04] hover:text-surface-dark-foreground",
                    )}
                  >
                    <span className="flex items-baseline gap-3">
                      {/* Laufende Nummer: die Reihenfolge ist hier echte Struktur,
                          vom Sortiment zur Verwaltung. */}
                      <span className="code text-xs text-surface-dark-border">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {link.label}
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                );
              })}
            </nav>

            {angemeldet ? null : (
              <div
                className="menu-item border-t border-surface-dark-border p-4"
                style={{ animationDelay: `${40 + links.length * 45}ms` }}
              >
                <Link
                  href="/login"
                  onClick={() => setOffen(false)}
                  className="flex items-center justify-center rounded-md bg-brand px-4 py-3 font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
                >
                  Anmelden
                </Link>
                <Link
                  href="/#kontakt"
                  onClick={() => setOffen(false)}
                  className="mt-3 block text-center text-sm text-surface-dark-muted underline underline-offset-4 hover:text-surface-dark-foreground"
                >
                  Noch kein Zugang? Anfragen
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
