import type { Metadata } from "next";
import { PreisschildWerkbank } from "@/components/admin/preisschild-werkbank";
import {
  getLabelIcons,
  getLabelOptionen,
  getLabelSizes,
  getPreisschildArtikel,
} from "@/lib/queries/preisschilder";
import { getEingangProductIds, getZuletztAufgenommen } from "@/lib/queries/stock";

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
export default async function PreisschilderPage({
  searchParams,
}: PageProps<"/admin/preisschilder">) {
  const params = await searchParams;
  // Vom Wareneingang kommend: die eben gebuchte Lieferung steht schon auf der
  // Liste. Gespeichert wird weiterhin nichts – die Vorauswahl ist eine Abfrage
  // des Journals, keine abgelegte Schilderliste.
  const eingang = typeof params.eingang === "string" ? params.eingang : null;
  // `?letzte=10`: die zehn zuletzt aufgenommenen Artikel, ohne Buchungsbezug.
  const letzte = Math.min(
    200,
    Math.max(0, Math.floor(Number(typeof params.letzte === "string" ? params.letzte : 0)) || 0),
  );

  const [artikel, icons, formate, labels, ausEingang, zuletzt] = await Promise.all([
    getPreisschildArtikel(),
    getLabelIcons(),
    getLabelSizes(),
    getLabelOptionen(),
    eingang ? getEingangProductIds(eingang) : Promise.resolve([]),
    getZuletztAufgenommen(),
  ]);
  const vorauswahl = eingang ? ausEingang : zuletzt.slice(0, letzte);

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

      <PreisschildWerkbank
        // Andere Lieferung, andere Liste: der Anfangszustand wird nur beim
        // Einhängen gelesen.
        key={eingang ?? `letzte-${letzte}`}
        vorauswahl={vorauswahl}
        zuletzt={zuletzt}
        artikel={artikel}
        icons={icons}
        formate={formate}
        labels={labels}
      />
    </div>
  );
}
