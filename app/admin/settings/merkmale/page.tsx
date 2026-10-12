import type { Metadata } from "next";
import { ProductAttributesSettings } from "@/components/forms/product-attributes-settings";
import { getProductAttributes } from "@/lib/queries/attributes";

export const metadata: Metadata = { title: "Merkmale" };

export default async function Seite() {
  const attributes = await getProductAttributes();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Merkmale</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Was einen Artikel beschreibt und wonach Kunden im Sortiment suchen –
        Farbe, Größe, Material. Hier stehen die Merkmale und ihre Werte; am
        einzelnen Artikel wird nur noch angehakt, was zutrifft. Anders als die
        Artikel-Flags sind Merkmale im Webshop sichtbar.
      </p>
      <div className="mt-6">
        <ProductAttributesSettings attributes={attributes} />
      </div>
    </div>
  );
}
