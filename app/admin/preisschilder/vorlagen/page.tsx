import type { Metadata } from "next";
import Link from "next/link";
import { PreisschildNav } from "@/components/admin/preisschild-nav";
import { PreisschildVorlagen } from "@/components/admin/preisschild-vorlagen";
import { getLabelSizes } from "@/lib/queries/preisschilder";

export const metadata: Metadata = { title: "Preisschild-Vorlagen" };

/**
 * Vorlagen-Schilder ohne Preis: „NEUHEIT", „STARK REDUZIERT" und eigene.
 *
 * Dieselben Schildgrößen und derselbe Bogen wie bei den Preisschildern; nur
 * die Zeichnung ist eine andere. Gespeichert wird nichts.
 */
export default async function PreisschildVorlagenPage() {
  const formate = await getLabelSizes();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Preisschild-Vorlagen</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Schilder ohne Preis für Aufsteller, Palette und Regalende. Eine
            Vorlage anklicken, Stückzahl festlegen, drucken – oder ein eigenes
            Schild mit freiem Text und eigener Farbe anlegen.
          </p>
        </div>
        <PreisschildNav />
        <p className="text-xs text-muted-foreground">
          Schildgrößen werden{" "}
          <Link
            href="/admin/preisschilder"
            className="underline underline-offset-2 hover:text-foreground"
          >
            beim Generator aus dem Bestand
          </Link>{" "}
          gepflegt und gelten hier mit.
        </p>
      </header>

      <PreisschildVorlagen formate={formate} />
    </div>
  );
}
