import type { Metadata } from "next";
import { ProductFlagsSettings } from "@/components/forms/product-flags-settings";
import { getProductFlags } from "@/lib/queries/product-flags";

export const metadata: Metadata = { title: "Artikel-Flags" };

export default async function Seite() {
  const productFlags = await getProductFlags();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Artikel-Flags</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Eigene Kennzeichen zum Organisieren und Filtern in der
        Artikelverwaltung – z. B. „Auslaufartikel“ oder „Nur Kasse“. Rein
        intern, im Webshop unsichtbar.
      </p>
      <div className="mt-6">
        <ProductFlagsSettings flags={productFlags} />
      </div>
    </div>
  );
}
