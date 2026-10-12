import type { Metadata } from "next";
import { MaintenanceModeSettings } from "@/components/forms/maintenance-mode-settings";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Wartungsmodus" };

export default async function Seite() {
  const settings = await getCompanySettings();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Wartungsmodus</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Solange der Webshop in Eigenentwicklung ist, kann hier der
        Wartungsscreen für neue Besucher ein- und ausgeschaltet werden.
      </p>
      <div className="mt-6">
        <MaintenanceModeSettings
          aktiv={settings.maintenance_mode}
          titel={settings.maintenance_title}
          nachricht={settings.maintenance_message}
          datum={settings.maintenance_until}
        />
      </div>
    </div>
  );
}
