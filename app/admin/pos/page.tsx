import type { Metadata } from "next";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { getCustomers } from "@/lib/queries/admin";
import { getCategories } from "@/lib/queries/products";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Kasse" };

/**
 * Ladenkasse. Alles, was die Oberfläche zum Start braucht, kommt hier vom
 * Server: Kundenliste für die Zuordnung, Warengruppen für die Schnellanlage,
 * Steuersatz und Preislesart aus den Firmendaten. Der Scanvorgang selbst
 * läuft danach über Server Actions (lib/actions/pos.ts).
 */
export default async function AdminPosPage() {
  const [customers, categories, settings] = await Promise.all([
    getCustomers(),
    getCategories(),
    getCompanySettings(),
  ]);

  return (
    <PosTerminal
      customers={customers}
      categories={categories}
      vatRate={Number(settings.pos_vat_rate)}
      pricesGross={settings.pos_prices_gross}
    />
  );
}
