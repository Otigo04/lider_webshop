import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { requireAdmin } from "@/lib/auth";

/**
 * Entspricht dem AdminGuard aus dem Implementierungsplan. Als Layout statt als
 * Client-Komponente: die Prüfung läuft dann auf dem Server, bevor irgendetwas
 * gerendert oder ausgeliefert wird – ein Client-Guard würde die Seite kurz
 * anzeigen und erst danach umleiten.
 */

const ADMIN_TABS: AdminTab[] = [
  { href: "/admin", label: "Übersicht", icon: "dashboard" },
  { href: "/admin/pos", label: "Kasse", icon: "kasse", hervorgehoben: true },
  { href: "/admin/products", label: "Artikel", icon: "artikel" },
  { href: "/admin/categories", label: "Kategorien", icon: "kategorien" },
  { href: "/admin/customers", label: "Kunden", icon: "kunden" },
  { href: "/admin/orders", label: "Bestellungen", icon: "bestellungen" },
  { href: "/admin/sales", label: "Verkäufe", icon: "verkaeufe" },
  { href: "/admin/invoices", label: "Rechnungen", icon: "rechnungen" },
  { href: "/admin/zugangsanfragen", label: "Zugangsanfragen", icon: "anfragen" },
  { href: "/admin/settings", label: "Einstellungen", icon: "einstellungen" },
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
