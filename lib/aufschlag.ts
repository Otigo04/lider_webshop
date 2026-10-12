/**
 * Großhandelspreis aus Einkaufspreis und Aufschlag.
 *
 * Eine Rechenstelle: die Vorschau in der Artikelliste und das Schreiben gehen
 * beide durch `aufschlagPreis()` (lib/actions/admin-products.ts). Gerechnet
 * wird in ganzen Cent, damit 14,00 % von 5,54 € nicht als 6,3156000000000004
 * herauskommen.
 *
 * Nur Prozent auf den Einkauf wäre bei billiger Ware zu wenig: 10 % auf 1 €
 * sind 10 Cent, die ein Artikel nicht trägt (Handling, Schwund). Deshalb gibt
 * es einen Mindestaufschlag in Euro; es gilt, was größer ist. Bei teurer Ware
 * dominiert die Prozentzahl, bei billiger der Mindestbetrag.
 */

export const RUNDUNGEN = ["keine", "5", "10", "9"] as const;
export type Rundung = (typeof RUNDUNGEN)[number];

export const RUNDUNG_LABELS: Record<Rundung, string> = {
  keine: "Auf den Cent genau",
  "5": "Auf 5 Cent aufrunden",
  "10": "Auf 10 Cent aufrunden",
  "9": "Preisendung ,x9",
};

export const AUFSCHLAG_STANDARD = {
  prozent: 20,
  mindestEuro: 0.5,
  rundung: "5" as Rundung,
};

/** Preis in Euro; Eingaben und Ergebnis auf ganze Cent. */
export function aufschlagPreis(eingabe: {
  ek: number;
  prozent: number;
  mindestEuro: number;
  rundung: Rundung;
}): number {
  const ek = Math.round(eingabe.ek * 100);
  const prozentAnteil = Math.round((ek * eingabe.prozent) / 100);
  const mindest = Math.round(eingabe.mindestEuro * 100);
  const cent = ek + Math.max(prozentAnteil, mindest);

  switch (eingabe.rundung) {
    case "5":
      return (Math.ceil(cent / 5) * 5) / 100;
    case "10":
      return (Math.ceil(cent / 10) * 10) / 100;
    case "9":
      // Nächste Zahl ≥ cent, deren letzte Stelle 9 ist.
      return (cent + ((9 - (cent % 10) + 10) % 10)) / 100;
    default:
      return cent / 100;
  }
}
