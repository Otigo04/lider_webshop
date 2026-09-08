import type { Metadata } from "next";
import { CompanySettingsForm } from "@/components/forms/company-settings-form";
import { ProductAttributesSettings } from "@/components/forms/product-attributes-settings";
import { ProductFlagsSettings } from "@/components/forms/product-flags-settings";
import { getCompanySettings } from "@/lib/queries/settings";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getProductFlags } from "@/lib/queries/product-flags";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function AdminSettingsPage() {
  const [settings, productFlags, attributes] = await Promise.all([
    getCompanySettings(),
    getProductFlags(),
    getProductAttributes(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Diese Angaben erscheinen auf jeder Rechnung – Absender, Steuernummer,
        Bankverbindung und Zahlungsziel.
      </p>

      <div className="mt-8 max-w-2xl">
        <CompanySettingsForm settings={settings} />
      </div>

      <div className="mt-12 max-w-2xl border-t border-border pt-8">
        <h2 className="text-lg font-semibold tracking-tight">Merkmale</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Was einen Artikel beschreibt und wonach Kunden im Sortiment suchen –
          Farbe, Größe, Material. Hier stehen die Merkmale und ihre Werte; am
          einzelnen Artikel wird nur noch angehakt, was zutrifft. Anders als die
          Flags darunter sind Merkmale im Webshop sichtbar.
        </p>
        <div className="mt-6">
          <ProductAttributesSettings attributes={attributes} />
        </div>
      </div>

      <div className="mt-12 max-w-2xl border-t border-border pt-8">
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
    </div>
  );
}
