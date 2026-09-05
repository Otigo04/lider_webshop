"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  Receipt,
  ScanBarcode,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface KasseTab {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

const ICONS = {
  uebersicht: LayoutDashboard,
  kasse: ScanBarcode,
  verkaeufe: Receipt,
  tagesabschluss: CalendarCheck,
  rechnungen: FileText,
} satisfies Record<string, LucideIcon>;

/**
 * Reiter des Kassenportals.
 *
 * Auf dunklem Grund statt auf weißem wie in der Verwaltung: das Portal soll
 * schon beim Hinsehen ein anderer Ort sein, nicht ein weiterer Reiter der
 * Verwaltung. Der aktive Reiter sitzt als heller Block auf der Leiste und
 * trägt oben die goldene Kante – dieselbe Rollenverteilung wie in der
 * Kopfleiste der Seite.
 */
export function KasseTabs({ tabs }: { tabs: KasseTab[] }) {
  const pfad = usePathname();

  return (
    <nav
      aria-label="Kasse und Buchhaltung"
      className="-mb-px flex flex-wrap items-center gap-1"
    >
      {tabs.map((tab) => {
        const aktiv =
          tab.href === "/kasse"
            ? pfad === "/kasse"
            : pfad === tab.href || pfad.startsWith(`${tab.href}/`);
        const Icon = ICONS[tab.icon];

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2 whitespace-nowrap rounded-t-md px-4 py-2.5 text-sm font-medium transition-colors",
              aktiv
                ? "bg-background text-foreground"
                : "text-surface-dark-muted hover:bg-white/10 hover:text-surface-dark-foreground",
            )}
          >
            {aktiv ? (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 rounded-t bg-gold"
              />
            ) : null}
            <Icon className="size-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}

      <Link
        href="/admin"
        className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-surface-dark-muted transition-colors hover:bg-white/10 hover:text-surface-dark-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Verwaltung
      </Link>
    </nav>
  );
}
