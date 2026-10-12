import type { Metadata } from "next";
import { ImpressumSettings } from "@/components/forms/impressum-settings";
import { IMPRESSUM_VORLAGE, leseImpressum } from "@/lib/impressum";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Impressum" };

export default async function Seite() {
  const settings = await getCompanySettings();
  const impressum = leseImpressum(settings.impressum);
  const impressumAbschnitte = impressum ?? IMPRESSUM_VORLAGE;

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Impressum</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Die Pflichtangaben unter /impressum. Abschnitte frei anlegen und
        umstellen; Firmendaten kommen über Platzhalter aus den Feldern der
        Firmendaten und müssen nicht doppelt gepflegt werden.
      </p>
      <div className="mt-6">
        {/* key: nach dem Speichern oder Zurücksetzen neu aufbauen, sonst
            hielte der Editor seinen alten Stand fest. */}
        <ImpressumSettings
          key={JSON.stringify(impressumAbschnitte)}
          abschnitte={impressumAbschnitte}
          gepflegt={impressum !== null}
          daten={settings}
        />
      </div>
    </div>
  );
}
