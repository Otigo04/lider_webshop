import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProductForm } from "@/components/forms/product-form";
import { getCategories } from "@/lib/queries/products";

export const metadata: Metadata = { title: "Neuer Artikel" };

export default async function NewProductPage() {
  const categories = await getCategories();

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
          <ProductForm categories={categories} />
        </div>
      )}
    </div>
  );
}
