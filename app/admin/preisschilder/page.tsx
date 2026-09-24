import type { Metadata } from "next";
import { PreisschildWerkbank } from "@/components/admin/preisschild-werkbank";
import {
  getLabelIcons,
  getLabelSizes,
  getPreisschildArtikel,
} from "@/lib/queries/preisschilder";

export const metadata: Metadata = { title: "Preisschilder" };

/**
 * Preisschild-Generator.
 *
 * Alles auf einer Seite: Artikel anklicken, Angaben nachbessern, Bogen
 * drucken. Gespeichert wird nichts – ein Preisschild ist eine Momentaufnahme
 * fürs Regal. Ändert sich der Preis, wird neu gedruckt; eine abgelegte
 * Schilderliste wäre nur eine zweite Wahrheit, die still veraltet. Bleiben
 * müssen allein die Symbole (Migration 038) und die Schildgrößen
 * (Migration 039) – beides Werkzeug, das über den einzelnen Druck hinausgeht.
 */
export default async function PreisschilderPage() {
  const [artikel, icons, formate] = await Promise.all([
    getPreisschildArtikel(),
    getLabelIcons(),
    getLabelSizes(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Preisschilder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Artikel auswählen, Stückzahl festlegen, drucken. Der Bogen kommt im
          A4-Format mit Schnittlinien aus dem Drucker und muss nur noch
          zerschnitten werden. Die Schildmaße stehen in Millimetern und lassen
          sich frei einstellen.
        </p>
      </header>

      <PreisschildWerkbank artikel={artikel} icons={icons} formate={formate} />
    </div>
  );
}
