import type { Metadata } from "next";
import { ShopTexteSettings } from "@/components/forms/shop-texte-settings";
import { getShopTexte } from "@/lib/queries/shop-texte";

export const metadata: Metadata = { title: "Texte der Sonderseiten" };

export default async function Seite() {
  const shopTexte = await getShopTexte();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Texte der Sonderseiten</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Der Satz unter der Überschrift von Reduziert, Restposten, Neuheiten
        und Topseller im Shop. Leer lassen, dann gilt der Standardtext.
      </p>
      <div className="mt-6">
        <ShopTexteSettings key={JSON.stringify(shopTexte)} texte={shopTexte} />
      </div>
    </div>
  );
}
