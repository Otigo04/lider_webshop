import type { Metadata } from "next";
import Image from "next/image";
import { fuelleImpressum } from "@/lib/impressum";
import { getLogoPath } from "@/lib/logo";
import { getPublicImpressum } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Impressum" };

/**
 * Pflichtangaben nach § 5 DDG. Aufbau und Text kommen aus den Einstellungen
 * (lib/impressum.ts, Migration 045), die Firmendaten über Platzhalter.
 * Nicht gepflegte Angaben stehen als „[Registergericht]" da – erfundene
 * Angaben wären hier eine Abmahnung wert, eine sichtbare Lücke fällt auf.
 */
export default async function ImpressumPage() {
  const logoPath = getLogoPath();
  const { abschnitte, daten } = await getPublicImpressum();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* Das Impressum ist die Seite, auf der sich der Betrieb ausweist –
          deshalb steht die Marke hier groß und nicht als Kopfzeilen-Icon. */}
      {logoPath ? (
        <Image
          src={logoPath}
          alt="LIDER Groß- und Einzelhandel"
          width={420}
          height={320}
          priority
          className="mb-10 h-auto w-64 object-contain sm:w-80"
        />
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight">Impressum</h1>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        {abschnitte.map((abschnitt, index) => (
          <section key={index}>
            {abschnitt.titel ? (
              <h2 className="font-medium">{abschnitt.titel}</h2>
            ) : null}
            {abschnitt.text ? (
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {fuelleImpressum(abschnitt.text, daten)}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
