import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { GruppenGenerator } from "@/components/admin/gruppen-generator";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";

export const metadata: Metadata = { title: "Neues Angebot" };

export default async function NeuesAngebotPage() {
  const [categories, attributes, zuletztKategorieId] = await Promise.all([
    getCategories(),
    getProductAttributes(),
    getLastUsedCategoryId(),
  ]);

  return (
    <div>
      <Link
        href="/admin/gruppen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Ausführungen
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Neues Angebot mit Ausführungen
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Merkmale ankreuzen, Preise und Bestände eintragen – die Artikel entstehen
        daraus in einem Zug, jeder mit eigener Artikelnummer aus dem
        Nummernkreis der Warengruppe.
      </p>

      {categories.length === 0 ? (
        <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Legen Sie zuerst eine{" "}
          <Link href="/admin/categories" className="underline">
            Warengruppe
          </Link>{" "}
          an – jeder Artikel braucht eine.
        </p>
      ) : (
        <div className="mt-8 max-w-5xl">
          <GruppenGenerator
            categories={categories}
            attributes={attributes}
            zuletztKategorieId={zuletztKategorieId}
          />
        </div>
      )}
    </div>
  );
}
