import type { Metadata } from "next";
import { PreisschildNav } from "@/components/admin/preisschild-nav";
import { PreisschildSchnell } from "@/components/admin/preisschild-schnell";
import { getLabelSizes } from "@/lib/queries/preisschilder";

export const metadata: Metadata = { title: "Schnelle Preisschilder" };

/**
 * Preisschilder ohne Artikel: Bezeichnung, Preis, Stück.
 *
 * Für Einzelware, die nicht in den Bestand soll. Geladen werden nur die
 * Schildgrößen; es wird nichts angelegt und nichts in den Stamm geschrieben.
 */
export default async function PreisschilderSchnellPage() {
  const formate = await getLabelSizes();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Schnelle Preisschilder</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Bezeichnung und Preis eintippen, Enter, nächstes Schild. Es wird
            nichts im Bestand angelegt.
          </p>
        </div>
        <PreisschildNav />
      </header>

      <PreisschildSchnell formate={formate} />
    </div>
  );
}
