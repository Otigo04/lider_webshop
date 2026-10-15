import type { Metadata } from "next";
import { OeffnungszeitenForm } from "@/components/forms/oeffnungszeiten-form";
import { getOeffnungszeiten } from "@/lib/queries/oeffnungszeiten";

export const metadata: Metadata = { title: "Öffnungszeiten" };

export default async function Seite() {
  const zeiten = await getOeffnungszeiten();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Öffnungszeiten</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Erscheinen auf Kontaktseite, Fußzeile und im Bestellformular. Zur
        Abholung lassen sich nur Termine innerhalb dieser Zeiten wählen.
      </p>
      <div className="mt-6">
        <OeffnungszeitenForm zeiten={zeiten} />
      </div>
    </div>
  );
}
