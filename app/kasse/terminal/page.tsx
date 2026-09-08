import type { Metadata } from "next";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { getCustomers } from "@/lib/queries/admin";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Kasse" };

/**
 * Ladenkasse. Alles, was die Oberfläche zum Start braucht, kommt hier vom
 * Server: Kundenliste für die Zuordnung, Warengruppen für die Schnellanlage,
 * Steuersatz und Preislesart aus den Firmendaten. Der Scanvorgang selbst
 * läuft danach über Server Actions (lib/actions/pos.ts).
 */
export default async function AdminPosPage() {
  const [customers, categories, settings, attributes, zuletztKategorieId] =
    await Promise.all([
      getCustomers(),
      getCategories(),
      getCompanySettings(),
      getProductAttributes(),
      getLastUsedCategoryId(),
    ]);

  return (
    <PosTerminal
      customers={customers}
      categories={categories}
      attributes={attributes}
      zuletztKategorieId={zuletztKategorieId}
      vatRate={Number(settings.pos_vat_rate)}
      pricesGross={settings.pos_prices_gross}
    />
  );
}
