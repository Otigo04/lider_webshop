"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  Receipt,
  ScanBarcode,
  ShoppingCart,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminTab {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Hebt die Kasse als eigenständigen Arbeitsplatz hervor */
  hervorgehoben?: boolean;
}

const ICONS = {
  dashboard: LayoutDashboard,
  artikel: Package,
  kategorien: FolderTree,
  kunden: Users,
  bestellungen: ShoppingCart,
  rechnungen: FileText,
  anfragen: UserPlus,
  kasse: ScanBarcode,
  verkaeufe: Receipt,
  einstellungen: Building2,
} satisfies Record<string, LucideIcon>;

/**
 * Reiterleiste der Verwaltung.
 *
 * Vorher eine Reihe grauer Textlinks ohne erkennbaren aktiven Zustand – man
 * sah nicht, wo man ist. Jetzt Reiter mit Symbol und Text, der aktive in
 * Markenfarbe ausgefüllt.
 *
 * Die Leiste bricht um, statt waagerecht zu scrollen: bei zehn Einträgen lief
 * der letzte („Einstellungen") sonst rechts aus dem Bild und sah abgeschnitten
 * aus, obwohl er nur weggescrollt war. Umbrechen zeigt alles auf einen Blick,
 * auch auf dem Tablet.
 */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pfad = usePathname();

  return (
    <nav
      aria-label="Verwaltung"
      className="mb-8 flex flex-wrap gap-1.5 border-b-2 border-border pb-3"
    >
      {tabs.map((tab) => {
        // /admin ist die Übersicht und darf nicht bei jedem Unterpfad
        // mitleuchten – deshalb dort auf Gleichheit prüfen.
        const aktiv =
          tab.href === "/admin"
            ? pfad === "/admin"
            : pfad === tab.href || pfad.startsWith(`${tab.href}/`);
        const Icon = ICONS[tab.icon];

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
              aktiv
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              // Die Kasse ist ein eigener Arbeitsplatz, kein Verwaltungspunkt
              // wie die anderen – sie trägt deshalb die Signalfarbe.
              tab.hervorgehoben && !aktiv && "text-signal hover:text-signal",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
