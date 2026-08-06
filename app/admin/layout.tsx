import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

/**
 * Entspricht dem AdminGuard aus dem Implementierungsplan. Als Layout statt als
 * Client-Komponente: die Prüfung läuft dann auf dem Server, bevor irgendetwas
 * gerendert oder ausgeliefert wird – ein Client-Guard würde die Seite kurz
 * anzeigen und erst danach umleiten.
 */

const ADMIN_LINKS = [
  { href: "/admin", label: "Übersicht" },
  { href: "/admin/products", label: "Artikel" },
  { href: "/admin/categories", label: "Kategorien" },
  { href: "/admin/customers", label: "Kunden" },
  { href: "/admin/orders", label: "Bestellungen" },
  { href: "/admin/zugangsanfragen", label: "Zugangsanfragen" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-3 text-sm">
        {ADMIN_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
