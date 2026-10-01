import type { Metadata } from "next";
import Link from "next/link";
import { PreisschildFrei } from "@/components/admin/preisschild-frei";
import { PreisschildNav } from "@/components/admin/preisschild-nav";
import {
  getLabelIcons,
  getLabelOptionen,
  getLabelSizes,
} from "@/lib/queries/preisschilder";

export const metadata: Metadata = { title: "Preisschilder frei eingeben" };

/**
 * Freier Preisschild-Generator – ohne Artikelstamm.
 *
 * Geladen wird nur das Werkzeug: Schildgrößen, Symbole und Labelfarben. Der
 * Artikelbestand bleibt bewusst draußen, denn genau darum geht es hier –
 * Aktionsware, Restposten und alles, was im Laden ein Schild braucht, ohne
 * dafür erst als Artikel angelegt zu werden.
 *
 * Gespeichert wird nichts in der Datenbank, wie beim Bestandsgenerator: ein
 * Preisschild ist eine Momentaufnahme. Die getippte Liste liegt im Browser,
 * damit ein versehentliches Neuladen die Arbeit nicht verwirft.
 */
export default async function PreisschilderFreiPage() {
  const [icons, formate, labels] = await Promise.all([
    getLabelIcons(),
    getLabelSizes(),
    getLabelOptionen(),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Preisschilder frei eingeben</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Bezeichnung und Preis tippen, Enter – das Schild liegt auf dem
            A4-Blatt. Noch eins, noch eins, drucken. Ein Artikel im Bestand ist
            dafür nicht nötig, der Bogen kommt mit Schnittlinien aus dem
            Drucker. Ein Vorher-Preis über dem Preis macht daraus ein rotes
            Aktionsschild.
          </p>
        </div>
        <PreisschildNav />
        <p className="text-xs text-muted-foreground">
          Schildgrößen, Symbole und Labelfarben werden{" "}
          <Link
            href="/admin/preisschilder"
            className="underline underline-offset-2 hover:text-foreground"
          >
            beim Generator aus dem Bestand
          </Link>{" "}
          gepflegt und gelten hier mit.
        </p>
      </header>

      <PreisschildFrei icons={icons} formate={formate} labels={labels} />
    </div>
  );
}
