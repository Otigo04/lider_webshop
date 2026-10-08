import type { Rechnung, RechnungPosition } from "@/lib/rechnung-import";

/**
 * Rechnungen der Iden-Gruppe (Iden System Großhandels GmbH, Iden
 * Logistikcenter GmbH) aus den Textzeilen des PDFs lesen.
 *
 * Ohne KI und ohne Kosten: die PDFs haben eine saubere Textschicht, und das
 * Layout ist bei beiden Gesellschaften dasselbe. Die Zeilen entstehen in
 * `lib/rechnung-lesen.ts` aus den Textstücken je Höhe; hier wird nur gelesen.
 *
 *   10 10065698 / 4018587753000 / 75300 / - 120 Stück 2,49 1,09 117,72
 *   Flutschi Ball 7cm 6fach sortiert 10,00 19,00
 *   Jahre                                   (Fortsetzung der Bezeichnung)
 *
 * Erste Zeile: Position, Artikelnummer / EAN / FAN / Referenz, Menge, Einheit,
 * [UVP], VK-Preis, Betrag. Zweite Zeile: Bezeichnung, [Rabatt %], MwSt. %.
 * Ohne Rabatt steht dort nur die MwSt. Lange Bezeichnungen laufen in weitere
 * Zeilen – auch hinter die Zahlen.
 *
 * Gelesen wird nur, was eindeutig ist. Was nicht passt, wird nicht geraten:
 * die Gegenproben in `lib/rechnung-import.ts` schlagen dann an.
 */

/** Das PDF hat ein Format, das wir nicht lesen können. */
export class RechnungsFormatFehler extends Error {}

const ZAHL = String.raw`\d[\d.]*,\d{2}`;

const POSITION = new RegExp(
  String.raw`^(\d{1,3})\s+(\S+)\s*/\s*(\d*)\s*/\s*(\S*)\s*/\s*(\S*)\s+(\d[\d.]*)\s+([^\d\s]\S*)\s+(${ZAHL}(?:\s+${ZAHL}){1,2})$`,
);
/** „40 1 3,95 3,95“ – Menge, Preis, Betrag ohne Artikelnummer. */
const OHNE_ARTIKEL = new RegExp(
  String.raw`^(\d{1,3})\s+(\d[\d.]*)\s+(${ZAHL})\s+(${ZAHL})$`,
);
/** Ende der Bezeichnungszeile: [Rabatt] MwSt, MwSt immer ganzzahlig („19,00“). */
const ZAHLENENDE = /^(.*?)\s*(?:(\d{1,3},\d{2})\s+)?(\d{1,2},00)$/;
const NEBENKOSTEN = /service|versand|fracht|verpack|porto|nebenkosten|pauschale/i;
/** Wo eine Bezeichnung endet: Tabellenkopf, Seitenwechsel, Summen, Fußzeile. */
const SCHLUSS =
  /^(Pos |Beschreibung|Gesamt|Rechnung |Datum |Seite |Auftrags|Externe|Lieferungsdatum|Verrechnung|Zahlung|\d+% MwSt|\?DocumentID)|IBAN|BIC |Geschäftsführer|HRB|USt-?Id|Sitz der Gesellschaft/;
/** Mehr Fortsetzungszeilen hat keine Bezeichnung; der Rest ist Beiwerk. */
const MAX_FORTSETZUNG = 3;

const zahl = (text: string) => Number(text.replace(/\./g, "").replace(",", "."));

function datumVierstellig(text: string): string {
  const [t, m, j] = text.split(".");
  return `${t}.${m}.${j.length === 2 ? `20${j}` : j}`;
}

export function leseIdenZeilen(zeilen: string[]): Rechnung {
  if (!zeilen.some((z) => /Art\.\s*Nr\.\s*\/\s*EAN/.test(z))) {
    throw new RechnungsFormatFehler("Kein Iden-Rechnungsformat");
  }

  const lieferant = zeilen.find((z) => z.trim())?.trim() ?? "";
  const nummer = zeilen.map((z) => /Rechnungs-?Nr\.?\s+(\S+)/.exec(z)?.[1]).find(Boolean);
  const datum = zeilen
    .map((z) => /^Datum\s+(\d{2}\.\d{2}\.(?:\d{4}|\d{2}))/.exec(z)?.[1])
    .find(Boolean);
  const netto = zeilen
    .map((z) => new RegExp(String.raw`^Gesamt EUR ohne MwSt\.?\s+(${ZAHL})$`).exec(z)?.[1])
    .find(Boolean);

  if (!nummer) throw new RechnungsFormatFehler("Keine Rechnungsnummer gefunden");
  if (!netto) throw new RechnungsFormatFehler("Keine Netto-Summe gefunden");

  const positionen: RechnungPosition[] = [];
  let nebenkosten = 0;

  /** Bezeichnung ab Zeile `von` einsammeln; liefert Text, Rabatt und die nächste Zeile. */
  function bezeichnung(von: number): { name: string; rabatt: number; weiter: number } {
    const teile: string[] = [];
    let rabatt = 0;
    let i = von;
    let fortsetzung = 0;
    let zahlenGelesen = false;

    for (; i < zeilen.length; i++) {
      const z = zeilen[i].trim();
      if (!z || SCHLUSS.test(z) || POSITION.test(z) || OHNE_ARTIKEL.test(z)) break;

      if (!zahlenGelesen) {
        const m = ZAHLENENDE.exec(z);
        if (m) {
          zahlenGelesen = true;
          if (m[2]) rabatt = zahl(m[2]);
          if (m[1]) teile.push(m[1]);
          continue;
        }
      }
      if (teile.length > 0 || zahlenGelesen) {
        if (++fortsetzung > MAX_FORTSETZUNG) break;
      }
      teile.push(z);
    }
    return { name: teile.join(" ").replace(/\s+/g, " ").trim(), rabatt, weiter: i };
  }

  for (let i = 0; i < zeilen.length; ) {
    const z = zeilen[i].trim();

    const p = POSITION.exec(z);
    if (p) {
      const zahlen = p[8].split(/\s+/).map(zahl);
      const { name, rabatt, weiter } = bezeichnung(i + 1);
      positionen.push({
        ean: p[3] || null,
        artikelnummer: p[2] || null,
        name,
        menge: zahl(p[6]),
        listenpreis: zahlen.length === 3 ? zahlen[1] : zahlen[0],
        rabattProzent: rabatt,
        uvp: zahlen.length === 3 ? zahlen[0] : null,
        zeilenbetrag: zahlen[zahlen.length - 1],
        warengruppeId: null,
      });
      i = weiter;
      continue;
    }

    const o = OHNE_ARTIKEL.exec(z);
    if (o) {
      const { name, rabatt, weiter } = bezeichnung(i + 1);
      const betrag = zahl(o[4]);
      if (NEBENKOSTEN.test(name)) {
        nebenkosten += betrag;
      } else {
        positionen.push({
          ean: null,
          artikelnummer: null,
          name,
          menge: zahl(o[2]),
          listenpreis: zahl(o[3]),
          rabattProzent: rabatt,
          uvp: null,
          zeilenbetrag: betrag,
          warengruppeId: null,
        });
      }
      i = weiter;
      continue;
    }
    i++;
  }

  return {
    lieferant,
    rechnungsnummer: nummer,
    datum: datum ? datumVierstellig(datum) : null,
    nettoGesamt: zahl(netto),
    nebenkostenNetto: Math.round(nebenkosten * 100) / 100,
    positionen,
  };
}
