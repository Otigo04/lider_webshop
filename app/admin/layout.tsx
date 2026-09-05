import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { requireAdmin } from "@/lib/auth";

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
  { href: "/admin/categories", label: "Kategorien", icon: "kategorien" },
  { href: "/admin/customers", label: "Kunden", icon: "kunden" },
  { href: "/admin/orders", label: "Bestellungen", icon: "bestellungen" },
  { href: "/admin/settings", label: "Einstellungen", icon: "einstellungen" },
  {
    href: "/kasse",
    label: "Kasse & Buchhaltung",
    icon: "kasse",
    hervorgehoben: true,
  },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminTabs tabs={ADMIN_TABS} />
      {children}
    </div>
  );
}
