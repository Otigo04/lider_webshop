import type { Metadata } from "next";
import { CompanySettingsForm } from "@/components/forms/company-settings-form";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function AdminSettingsPage() {
  const settings = await getCompanySettings();

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
    </div>
  );
}
