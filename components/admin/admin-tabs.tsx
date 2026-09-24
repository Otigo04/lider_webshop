"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  FileText,
  FolderTree,
  Layers,
  LayoutDashboard,
  Package,
  PackagePlus,
  Receipt,
  ScanBarcode,
  ShoppingCart,
  Tags,
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
  ausfuehrungen: Layers,
  bestand: PackagePlus,
  preisschilder: Tags,
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
 *
 * Seit „Preisschilder" dazugekommen ist, passt die Reihe auf schmaleren
 * Schirmen nicht mehr in eine Zeile. Das ist kein Fehler: der Kassenknopf
 * rutscht dann in die zweite Zeile und steht dort weiterhin rechts außen –
 * abgesetzt, wie er es in einer Zeile auch wäre.
 */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pfad = usePathname();

  return (
    <nav
      aria-label="Verwaltung"
      // gap-1 und px-2.5 statt gap-1.5/px-3: mit den weiteren Werten kamen die
      // acht Reiter plus Kassenknopf auf 1142 px und passten damit nie in die
      // auf max-w-6xl (1120 px) gedeckelte Spalte. Der Knopf rutschte deshalb
      // auf jedem Desktop in eine zweite Zeile und stand dort allein.
      className="mb-8 flex flex-wrap gap-1 border-b-2 border-border pb-3"
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
              "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              aktiv
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              // Die Kasse ist ein eigenes Portal, kein Verwaltungspunkt wie die
              // anderen – sie steht als goldener Knopf da, nicht als Reiter.
              tab.hervorgehoben &&
                !aktiv &&
                "ml-auto bg-gold text-gold-foreground shadow-sm hover:bg-gold/85 hover:text-gold-foreground",
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
