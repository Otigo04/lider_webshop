import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { KatalogWerkbank } from "@/components/admin/katalog-werkbank";
import { getKatalog, getKatalogArtikel } from "@/lib/queries/kataloge";

export const metadata: Metadata = { title: "Katalog bearbeiten" };

/**
 * Werkbank eines Katalogs.
 *
 * Der ganze Artikelstamm geht einmal in den Browser, wie bei der
 * Preisschild-Werkbank: gesucht, gezählt und umbrochen wird dort, ohne
 * Rundreise je Tastendruck. Gespeichert wird trotzdem sofort – jede Änderung
 * geht als eigene Action hinaus.
 */
export default async function KatalogPage({
  params,
}: PageProps<"/admin/kataloge/[id]">) {
  const { id } = await params;
  const [katalog, artikel] = await Promise.all([
    getKatalog(id),
    getKatalogArtikel(),
  ]);
  if (!katalog) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/kataloge"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Alle Kataloge
      </Link>

      <KatalogWerkbank
        id={katalog.id}
        einstellungen={katalog.einstellungen}
        productIds={katalog.productIds}
        baldIds={katalog.baldIds}
        artikel={artikel}
      />
    </div>
  );
}
