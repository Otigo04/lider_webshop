import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Verwaltung" };

const SECTIONS = [
  {
    href: "/admin/products",
    title: "Artikel",
    text: "Artikel anlegen, Fotos hochladen, Staffelpreise und Bestände pflegen.",
  },
  {
    href: "/admin/categories",
    title: "Kategorien",
    text: "Warengruppen anlegen und Reihenfolge im Shop festlegen.",
  },
  {
    href: "/admin/customers",
    title: "Kunden",
    text: "Zugänge anlegen, Kunden deaktivieren, Stammdaten bearbeiten.",
  },
  {
    href: "/admin/orders",
    title: "Bestellungen",
    text: "Eingegangene Bestellungen einsehen und Status ändern.",
  },
];

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Verwaltung</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kennzahlen und Auswertungen folgen mit dem Dashboard in Phase 5.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-md border border-border bg-card p-5 hover:border-foreground/25"
          >
            <h2 className="font-medium">{section.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{section.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
