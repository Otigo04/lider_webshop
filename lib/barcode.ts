/**
 * Strichcode für Preisschilder: EAN-13, EAN-8 und UPC-A.
 *
 * Eigener Encoder statt einer Bibliothek, aus demselben Grund wie bei
 * `lib/preisschild.ts`: die Schilder werden an zwei Stellen gezeichnet – im
 * Druckbogen auf dem Server und in der Vorschau im Browser. Eine Bibliothek
 * müsste in beide Bündel, und für drei Symbologien mit zusammen drei
 * Tabellen à zehn Zeilen wäre das viel Gewicht für wenig Inhalt. Die
 * Ausgabe ist gegen die Decoder aus `@zxing/library` geprüft.
 *
 * **Keine Bildkodierung, sondern Module.** Ein Modul ist die schmalste
 * Strich- bzw. Lückenbreite; ein EAN-13 besteht aus 95 davon. Wie breit ein
 * Modul auf dem Papier wird, entscheidet erst das Schild – dort steht die
 * verfügbare Breite. Ein fertiges Bild (PNG, SVG mit fester Größe) müsste
 * dafür skaliert werden, und ein auf krumme Faktoren skalierter Strichcode
 * ist genau das, was Scanner nicht mehr lesen.
 *
 * **Code 128 fehlt bewusst.** Die Ware im Laden trägt EAN; eine eigene
 * 107-Zeilen-Tabelle, die niemand nachrechnet, wäre ein Risiko für den einen
 * Artikel mit Buchstaben im Feld. Was sich nicht als EAN lesen lässt, steht
 * weiter als Ziffernfolge auf dem Schild (siehe `schildKennung()`).
 */

export type BarcodeTyp = "EAN-13" | "EAN-8" | "UPC-A";

export interface Barcode {
  typ: BarcodeTyp;
  /** Ziffern einschließlich Prüfziffer – der Klartext unter den Strichen. */
  text: string;
  /**
   * Gesamtbreite in Modulen, Ruhezonen eingerechnet. Daraus folgt die
   * Modulbreite auf dem Papier: verfügbare Breite geteilt durch diesen Wert.
   */
  breite: number;
  /** Strich- und Lückenfolge über die volle Breite, Ruhezonen als Lücken. */
  abschnitte: BarcodeAbschnitt[];
}

export interface BarcodeAbschnitt {
  /** true = schwarzer Strich, false = Lücke */
  strich: boolean;
  /** Breite in Modulen */
  module: number;
}

/* Zifferntabellen. Je sieben Module. ------------------------------------- */

/** Linke Hälfte, ungerade Parität. */
const L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];

/** Linke Hälfte, gerade Parität – nur EAN-13. */
const G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];

/** Rechte Hälfte, immer gerade Parität (das Gegenstück zu L). */
const R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];

/**
 * Die erste Ziffer eines EAN-13 wird nicht gedruckt, sondern über die Parität
 * der sechs folgenden Ziffern verschlüsselt. Deshalb trägt ein EAN-13
 * dreizehn Ziffern im Klartext, aber nur zwölf im Strichbild.
 */
const PARITAET = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

const START = "101";
const MITTE = "01010";
const ENDE = "101";

/**
 * Ruhezonen in Modulen. Ohne sie findet der Scanner den Anfang nicht – sie
 * sind Teil des Codes und nicht Rand, den man beim Layouten wegnehmen darf.
 */
const RUHE: Record<BarcodeTyp, [number, number]> = {
  "EAN-13": [11, 7],
  "UPC-A": [9, 9],
  "EAN-8": [7, 7],
};

/**
 * Prüfziffer nach GS1: von rechts nach links abwechselnd mit 3 und 1
 * gewichtet, Summe auf den nächsten Zehner ergänzt.
 */
export function pruefziffer(daten: string): number {
  let summe = 0;
  let gewicht = 3;
  for (let i = daten.length - 1; i >= 0; i--) {
    summe += Number(daten[i]) * gewicht;
    gewicht = gewicht === 3 ? 1 : 3;
  }
  return (10 - (summe % 10)) % 10;
}

function stimmt(code: string): boolean {
  return pruefziffer(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * Rohwert aus `products.barcode` zu einem druckbaren Strichcode.
 *
 * `null` heißt „lässt sich nicht als EAN lesen" – kein Fehler, sondern der
 * Normalfall bei einer hauseigenen Nummer. Der Aufrufer schreibt sie dann als
 * Ziffernfolge aufs Schild.
 *
 * Eine **falsche Prüfziffer wird nicht stillschweigend berichtigt**: dann
 * stünde eine andere Nummer auf dem Schild als im Artikelstamm, und an der
 * Kasse fände der Scan nichts. Lieber kein Strichcode als ein falscher.
 * Fehlt die Prüfziffer dagegen ganz (12 bzw. 7 Ziffern), wird sie ergänzt –
 * das ist keine Änderung, sondern die Vervollständigung derselben Nummer.
 */
export function barcode(roh: string | null | undefined): Barcode | null {
  const ziffern = String(roh ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(ziffern)) return null;

  switch (ziffern.length) {
    case 13:
      return stimmt(ziffern) ? ean13(ziffern, "EAN-13", ziffern) : null;
    case 12:
      // Zwölf Ziffern sind zweideutig: ein vollständiger UPC-A oder ein
      // EAN-13 ohne Prüfziffer. Stimmt die UPC-A-Prüfziffer, ist es einer –
      // dass sie bei einem angeschnittenen EAN-13 zufällig aufgeht, ist eine
      // Zehntelchance und wäre am Regal ohnehin nicht zu unterscheiden.
      return stimmt(ziffern)
        ? ean13(`0${ziffern}`, "UPC-A", ziffern)
        : ean13(`${ziffern}${pruefziffer(ziffern)}`, "EAN-13", `${ziffern}${pruefziffer(ziffern)}`);
    case 11: {
      const voll = `${ziffern}${pruefziffer(ziffern)}`;
      return ean13(`0${voll}`, "UPC-A", voll);
    }
    case 8:
      return stimmt(ziffern) ? ean8(ziffern) : null;
    case 7:
      return ean8(`${ziffern}${pruefziffer(ziffern)}`);
    default:
      return null;
  }
}

function ean13(code: string, typ: BarcodeTyp, text: string): Barcode {
  const paritaet = PARITAET[Number(code[0])];
  let folge = START;
  for (let i = 0; i < 6; i++) {
    const ziffer = Number(code[i + 1]);
    folge += paritaet[i] === "L" ? L[ziffer] : G[ziffer];
  }
  folge += MITTE;
  for (let i = 7; i < 13; i++) folge += R[Number(code[i])];
  folge += ENDE;
  return fertig(typ, text, folge);
}

function ean8(code: string): Barcode {
  let folge = START;
  for (let i = 0; i < 4; i++) folge += L[Number(code[i])];
  folge += MITTE;
  for (let i = 4; i < 8; i++) folge += R[Number(code[i])];
  folge += ENDE;
  return fertig("EAN-8", code, folge);
}

/** Ruhezonen anhängen und die Modulfolge zu Abschnitten zusammenfassen. */
function fertig(typ: BarcodeTyp, text: string, folge: string): Barcode {
  const [links, rechts] = RUHE[typ];
  const voll = "0".repeat(links) + folge + "0".repeat(rechts);

  // Zusammengefasst statt Modul für Modul: ein EAN-13 sind 113 Module, aber
  // nur rund 60 Abschnitte – und jeder Abschnitt wird ein Element im Bogen.
  const abschnitte: BarcodeAbschnitt[] = [];
  for (const zeichen of voll) {
    const strich = zeichen === "1";
    const letzter = abschnitte[abschnitte.length - 1];
    if (letzter && letzter.strich === strich) letzter.module += 1;
    else abschnitte.push({ strich, module: 1 });
  }

  return { typ, text, breite: voll.length, abschnitte };
}

/**
 * Nennmaß eines Moduls in Millimetern (SC2 der EAN-Norm).
 *
 * Die Norm lässt 0,264 bis 0,660 mm zu. Darunter wird der Druck eines
 * Bürodruckers unzuverlässig: die Tonerkante fällt gegenüber der Vorlage
 * breiter aus, und bei 0,2 mm frisst das den Unterschied zwischen einem
 * schmalen und einem breiten Strich auf.
 */
export const MODUL_NENN = 0.33;

/** Untergrenze, ab der ein gedruckter Code noch zuverlässig gelesen wird. */
export const MODUL_MIN = 0.26;

/**
 * Harte Untergrenze. Darunter ist das Ergebnis kein Strichcode mehr, sondern
 * ein grauer Streifen – benachbarte Striche verschmelzen schon im Druckbild.
 * Dann steht besser die Nummer im Klartext da, die ein Mensch abtippen kann.
 */
export const MODUL_HART = 0.16;
