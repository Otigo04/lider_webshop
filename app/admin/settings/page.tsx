import type { Metadata } from "next";
import { CompanySettingsForm } from "@/components/forms/company-settings-form";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function Seite() {
  const settings = await getCompanySettings();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Firmendaten</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Diese Angaben erscheinen auf jeder Rechnung – Absender, Steuernummer,
        Bankverbindung und Zahlungsziel.
      </p>
      <div className="mt-6">
        <CompanySettingsForm settings={settings} />
      </div>
    </div>
  );
}
