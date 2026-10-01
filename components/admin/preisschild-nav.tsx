"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PencilLine, Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Die zwei Wege zum Preisschild.
 *
 * Kein eigener Reiter in der Verwaltungsleiste: die ist mit neun Einträgen
 * plus Kassenknopf schon am Rand ihrer Spalte (siehe admin-tabs.tsx). Beide
 * Generatoren gehören ohnehin zusammen – derselbe Bogen, dieselben Schilder,
 * nur eine andere Quelle für die Angaben. Eine Unterleiste auf der Seite
 * zeigt das besser als zwei weit auseinanderliegende Reiter.
 */
const WEGE = [
  {
    href: "/admin/preisschilder",
    label: "Aus dem Bestand",
    hinweis: "Artikel anklicken",
    icon: Package,
  },
  {
    href: "/admin/preisschilder/frei",
    label: "Frei eingeben",
    hinweis: "scannen oder tippen",
    icon: PencilLine,
  },
] as const;

export function PreisschildNav() {
  const pfad = usePathname();

  return (
    <nav aria-label="Preisschild-Generator" className="flex flex-wrap gap-2">
      {WEGE.map((weg) => {
        const aktiv = pfad === weg.href;
        const Icon = weg.icon;
        return (
          <Link
            key={weg.href}
            href={weg.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
              aktiv
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium leading-tight">{weg.label}</span>
              <span
                className={cn(
                  "block text-[11px] leading-tight",
                  aktiv ? "text-brand-foreground/75" : "text-muted-foreground",
                )}
              >
                {weg.hinweis}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
