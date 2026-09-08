import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ScanBarcode } from "lucide-react";
import { ProductForm } from "@/components/forms/product-form";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getGroupOptions } from "@/lib/queries/groups";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";

export const metadata: Metadata = { title: "Neuer Artikel" };

export default async function NewProductPage() {
  const [categories, attributes, zuletztKategorieId, groupOptions] =
    await Promise.all([
      getCategories(),
      getProductAttributes(),
      getLastUsedCategoryId(),
      getGroupOptions(),
    ]);

  return (
    <div>
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Artikel
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Neuer Artikel
      </h1>

      {/* Dieses Formular ist der ausführliche Weg: Fotos, Beschreibung,
          Preisstaffeln. Wer eine Lieferung auspackt, will davon nichts – er
          will scannen, zählen, weiter. Der Hinweis steht deshalb ganz oben und
          nicht im Kleingedruckten. */}
      <Link
        href="/admin/bestand"
        className="card-hover mt-4 flex items-start gap-3 rounded-lg border-2 border-brand/30 bg-brand-soft p-4"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <ScanBarcode className="size-5" aria-hidden />
        </span>
        <span>
          <span className="block font-semibold text-brand">
            Mehrere Artikel auf einmal? Zum Wareneingang
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Barcode scannen, Bezeichnung, Menge und beide Preise eintragen –
            Zeile für Zeile, ohne Formular. Fotos und Beschreibung lassen sich
            später nachtragen.
          </span>
        </span>
      </Link>

      {categories.length === 0 ? (
        <p className="mt-8 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Legen Sie zuerst eine{" "}
          <Link href="/admin/categories" className="underline">
            Kategorie
          </Link>{" "}
          an – jeder Artikel braucht eine.
        </p>
      ) : (
        <div className="mt-8 max-w-3xl">
          <ProductForm
            categories={categories}
            attributes={attributes}
            groupOptions={groupOptions}
            zuletztKategorieId={zuletztKategorieId}
          />
        </div>
      )}
    </div>
  );
}
