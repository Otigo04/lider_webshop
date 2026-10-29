import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { PushSync } from "@/components/admin/push-sync";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Entspricht dem AdminGuard aus dem Implementierungsplan. Als Layout statt als
 * Client-Komponente: die Prüfung läuft dann auf dem Server, bevor irgendetwas
 * gerendert oder ausgeliefert wird – ein Client-Guard würde die Seite kurz
 * anzeigen und erst danach umleiten.
 */

/**
 * Kasse, Verkäufe und Rechnungen stehen hier nicht mehr: sie bilden unter
 * /kasse ein eigenes Portal. Die Verwaltung pflegt Stammdaten und
 * Bestellungen, die Kasse führt das Geld – zwei Arbeitsplätze, zwei Leisten.
 * Der letzte Reiter ist deshalb kein Verwaltungspunkt, sondern die Tür dorthin.
 *
 * Zugangsanfragen haben keinen eigenen Reiter mehr: seit der Selbstregistrierung
 * unter /register laufen dort keine Vorgänge mehr auf, die täglich anzusehen
 * wären. Die Seite bleibt unter /admin/zugangsanfragen erreichbar, damit
 * Altbestand und verlinkte Benachrichtigungen weiter funktionieren.
 */
const ADMIN_TABS: AdminTab[] = [
  { href: "/admin", label: "Übersicht", icon: "dashboard" },
  { href: "/admin/products", label: "Artikel", icon: "artikel" },
  { href: "/admin/gruppen", label: "Ausführungen", icon: "ausfuehrungen" },
  { href: "/admin/bestand", label: "Bestand", icon: "bestand" },
  { href: "/admin/preisschilder", label: "Preisschilder", icon: "preisschilder" },
  { href: "/admin/kataloge", label: "Kataloge", icon: "kataloge" },
  { href: "/admin/categories", label: "Kategorien", icon: "kategorien" },
  { href: "/admin/customers", label: "Kunden", icon: "kunden" },
  { href: "/admin/gutscheine", label: "Gutscheine", icon: "gutscheine" },
  { href: "/admin/newsletter", label: "Newsletter", icon: "newsletter" },
  { href: "/admin/kassenbuch", label: "Kassenbuch", icon: "kassenbuch" },
  { href: "/admin/orders", label: "Bestellungen", icon: "bestellungen" },
  { href: "/admin/startseite", label: "Startseite", icon: "startseite" },
  { href: "/admin/settings", label: "Einstellungen", icon: "einstellungen" },
  {
    href: "/kasse",
    label: "Kasse & Buchhaltung",
    icon: "kasse",
    hervorgehoben: true,
  },
];

/**
 * Bestellungen im Anfangsstatus „Eingegangen“ (create_order setzt 'submitted').
 * Zweite Absicherung neben dem Push: bleibt eine Mitteilung einmal aus, steht
 * die Zahl beim nächsten Öffnen der Verwaltung am Reiter „Bestellungen“.
 */
async function zaehleNeueBestellungen(): Promise<number> {
  const { count, error } = await (await createClient())
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");
  if (error) {
    console.error("[admin] Zähler neue Bestellungen:", error.message);
    return 0;
  }
  return count ?? 0;
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const neu = await zaehleNeueBestellungen();
  const tabs = ADMIN_TABS.map((tab) =>
    tab.href === "/admin/orders" && neu > 0 ? { ...tab, badge: neu } : tab,
  );

  return (
    // Fast volle Fensterbreite: die Tabellen (Artikel mit acht Spalten) liefen
    // bei max-w-6xl über den Rand und mussten seitlich gescrollt werden,
    // während links und rechts Weißraum stand. Erst ab sehr breiten Schirmen
    // wird gedeckelt, damit Zeilen nicht endlos lang werden.
    <div className="mx-auto max-w-[120rem] px-4 py-8 sm:px-6 lg:px-8">
      <PushSync />
      <AdminTabs tabs={tabs} />
      {children}
    </div>
  );
}
