import type { Metadata } from "next";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { getCustomers } from "@/lib/queries/admin";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";
import { getCompanySettings } from "@/lib/queries/settings";
import { getConditions } from "@/lib/queries/vouchers";

export const metadata: Metadata = { title: "Kasse" };

/**
 * Ladenkasse. Alles, was die Oberfläche zum Start braucht, kommt hier vom
 * Server: Kundenliste für die Zuordnung, Warengruppen für die Schnellanlage,
 * Steuersatz und Preislesart aus den Firmendaten. Der Scanvorgang selbst
 * läuft danach über Server Actions (lib/actions/pos.ts).
 */
export default async function AdminPosPage() {
  const [customers, categories, settings, attributes, zuletztKategorieId, konditionen] =
    await Promise.all([
      getCustomers(),
      getCategories(),
      getCompanySettings(),
      getProductAttributes(),
      getLastUsedCategoryId(),
      getConditions(),
    ]);

  return (
    <PosTerminal
      customers={customers}
      categories={categories}
      attributes={attributes}
      zuletztKategorieId={zuletztKategorieId}
      vatRate={Number(settings.pos_vat_rate)}
      pricesGross={settings.pos_prices_gross}
      konditionen={Object.fromEntries(
        [...konditionen].map(([id, k]) => [id, Number(k.discount_percent)]),
      )}
    />
  );
}
