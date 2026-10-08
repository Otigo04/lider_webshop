/**
 * Bestandsliste für PDF und Excel – die reinen Funktionen.
 *
 * Eine Zeile je Artikel. Sortiert, summiert und der Warenwert gerechnet wird
 * hier und nur hier; die beiden Ausgaben (`bestand-pdf.ts`, `bestand-xlsx.ts`)
 * zeichnen nur, was sie bekommen. So stehen in Tabelle und Papier dieselben
 * Zahlen.
 *
 * Der Einkaufspreis ist nur fürs Haus. Wer ihn nicht ausdrücklich verlangt,
 * bekommt ihn auch nicht: `ohneEinkauf()` entfernt ihn aus den Zeilen, bevor
 * ein Zeichner sie sieht.
 */

export interface BestandZeile {
  sku: string;
  barcode: string | null;
  name: string;
  kategorie: string;
  bestand: number;
  /** Ladenpreis, null = nicht gepflegt */
  laden: number | null;
  /** Kleinste Großhandelsstaffel, null = keine */
  grosshandel: number | null;
  /** Einkaufspreis, null = nicht gepflegt */
  einkauf: number | null;
  /** Bestand × Einkaufspreis, null ohne Einkaufspreis */
  warenwert: number | null;
}

const cent = (betrag: number) => Math.round(betrag * 100);

/** Warenwert zum Einkaufspreis; ein negativer Bestand zählt nicht als Schuld. */
export function warenwert(bestand: number, einkauf: number | null): number | null {
  if (einkauf === null) return null;
  return cent(Math.max(bestand, 0) * einkauf) / 100;
}

/** Nach Warengruppe, dann Bezeichnung – so liegt die Liste im Regal. */
export function sortiere(zeilen: BestandZeile[]): BestandZeile[] {
  const de = new Intl.Collator("de", { sensitivity: "base", numeric: true });
  return [...zeilen].sort(
    (a, b) => de.compare(a.kategorie, b.kategorie) || de.compare(a.name, b.name),
  );
}

export interface BestandSummen {
  positionen: number;
  stueck: number;
  /** Summe der Warenwerte; null, wenn kein Artikel einen Einkaufspreis hat */
  warenwertEk: number | null;
}

export function summen(zeilen: BestandZeile[]): BestandSummen {
  let stueck = 0;
  let wertCent = 0;
  let mitWert = false;
  for (const z of zeilen) {
    stueck += Math.max(z.bestand, 0);
    if (z.warenwert !== null) {
      wertCent += cent(z.warenwert);
      mitWert = true;
    }
  }
  return {
    positionen: zeilen.length,
    stueck,
    warenwertEk: mitWert ? wertCent / 100 : null,
  };
}

/** Einkaufspreis und Warenwert entfernen. */
export function ohneEinkauf(zeilen: BestandZeile[]): BestandZeile[] {
  return zeilen.map((z) => ({ ...z, einkauf: null, warenwert: null }));
}
