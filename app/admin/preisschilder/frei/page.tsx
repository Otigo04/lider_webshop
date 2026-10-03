import type { Metadata } from "next";
import Link from "next/link";
import { PreisschildFrei } from "@/components/admin/preisschild-frei";
import { PreisschildNav } from "@/components/admin/preisschild-nav";
import {
  getLabelIcons,
  getLabelOptionen,
  getLabelSizes,
} from "@/lib/queries/preisschilder";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";

export const metadata: Metadata = { title: "Preisschilder frei eingeben" };

/**
 * Freier Preisschild-Generator mit Artikelabgleich.
 *
 * Geladen wird das Werkzeug – Schildgrößen, Symbole, Labelfarben – und die
 * Warengruppen: der Artikelbestand selbst bleibt draußen, nachgeschlagen wird
 * erst beim Scannen (`sucheSchildArtikel`). Ein bekannter Code füllt das
 * Formular, ein unbekannter wird zu einem neuen Artikel, und ohne Barcode
 * bleibt es ein reines Schild für Aktionsware und Restposten.
 *
 * Die Warengruppen braucht nur der zweite Fall, stehen aber trotzdem schon
 * hier: nachzuladen, während jemand am Tresen mit der Ware in der Hand
 * wartet, wäre genau die Pause, die der Scan einsparen soll. Vorgabe ist die
 * Warengruppe des zuletzt angelegten Artikels – dieselbe Regel wie im
 * Wareneingang und an der Kasse.
 *
 * Gespeichert wird kein Schild, wie beim Bestandsgenerator: ein Preisschild
 * ist eine Momentaufnahme. Die getippte Liste liegt im Browser, damit ein
 * versehentliches Neuladen die Arbeit nicht verwirft.
 */
export default async function PreisschilderFreiPage() {
  const [icons, formate, labels, kategorien, vorgabeKategorie] =
    await Promise.all([
      getLabelIcons(),
      getLabelSizes(),
      getLabelOptionen(),
      getCategories(),
      getLastUsedCategoryId(),
    ]);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Preisschilder frei eingeben</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Scannen oder tippen, Enter – das Schild liegt auf dem A4-Blatt.
            Noch eins, noch eins, drucken. Ein bekannter Barcode füllt
            Bezeichnung und Preise aus dem Artikelstamm und legt das Schild
            gleich ab, ein unbekannter legt den Artikel mit an. Ohne Barcode
            findet die Bezeichnung den Artikel im Bestand; ohne Treffer bleibt
            es ein reines Schild. Ein Vorher-Preis über dem Preis macht daraus
            ein rotes Aktionsschild.
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

      <PreisschildFrei
        icons={icons}
        formate={formate}
        labels={labels}
        kategorien={kategorien}
        vorgabeKategorie={vorgabeKategorie}
      />
    </div>
  );
}
