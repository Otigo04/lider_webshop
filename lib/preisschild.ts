/**
 * Preisschilder fürs Regal – Rechenregeln, Maße und Typografie.
 *
 * Bewusst ohne Server-Importe: dieselben Regeln gelten in der Werkbank
 * (components/admin/preisschild-werkbank.tsx, Client) und im Druckbogen
 * (lib/preisschild-bogen.ts, Server). Stünde der Großhandelscode an zwei
 * Stellen, liefe die Vorschau über kurz oder lang neben dem Papier her.
 */

import { MODUL_HART, MODUL_NENN, barcode, type Barcode } from "@/lib/barcode";
import { toNumber } from "@/lib/format";
import { reduzierung } from "@/lib/pricing";

/** Ein Schild, wie es der Bogen braucht. Alles bereits aufgelöst. */
export interface Preisschild {
  /** Bezeichnung, wie sie auf dem Papier steht */
  name: string;
  /** Verkaufspreis in Euro */
  preis: number;
  /** Durchgestrichener Vorher-Preis, null = keine Reduzierung */
  vorher: number | null;
  /** Ersparnis in ganzen Prozent, null = keine Reduzierung */
  prozent: number | null;
  /** Artikelnummer */
  sku: string;
  /** Großhandelscode hinter dem „#", null = keiner gewünscht */
  code: string | null;
  /**
   * Barcode des Artikels, roh aus dem Artikelstamm. null = nicht aufs Schild.
   *
   * Gezeichnet wird daraus ein echter Strichcode (`lib/barcode.ts`), damit
   * der Handscanner das Schild lesen kann – am Regal, bei der Inventur und
   * an der Kasse, wenn die Ware selbst kein Etikett trägt. Lässt sich der
   * Wert nicht als EAN lesen (hauseigene Nummer mit Buchstaben), steht er
   * als Ziffernfolge hinter der Artikelnummer.
   */
  barcode: string | null;
  /** Data-URI (Druck) bzw. Signed URL (Vorschau) des Symbols, null = keins */
  icon: string | null;
  /** Farbiges Label in der Fußzeile („Neu", „Topseller", Artikel-Flag), null = keins */
  label: SchildLabel | null;
}

/**
 * Ein wählbares Label: „Neu", „Topseller" oder ein Artikel-Flag. Der Text
 * kommt aus dem Bestand, gepflegt wird hier nur die Farbe (Migration 040).
 */
export interface LabelOption {
  /** 'neu', 'topseller' oder 'flag:<uuid>' */
  key: string;
  name: string;
  farbe: string;
}

/**
 * Farben, solange keine eigene gespeichert ist. Die Flags nehmen den
 * Farbton ihres Farbpunkts in der Artikelliste (.tag-N in app/globals.css),
 * damit ein Label auf dem Schild so aussieht wie in der Verwaltung.
 */
export const LABEL_VORGABEN = {
  neu: "#059669",
  topseller: "#b8721c",
  flags: ["#283f78", "#0f5f57", "#9a4310", "#9c1f47", "#4c2f96", "#1c6b34"],
} as const;

/** Ein Label, wie es auf dem Schild steht: Text und Flächenfarbe. */
export interface SchildLabel {
  name: string;
  /** Hex-Farbe der Fläche, #rrggbb */
  farbe: string;
}

// --- Bogen und Schildgröße ---------------------------------------------------

/** A4 in Millimetern. */
export const SEITE = { breite: 210, hoehe: 297 } as const;

/**
 * Rand des Bogens. 8 mm, weil kein üblicher Bürodrucker näher an die Kante
 * kommt – ein randlos gesetztes Raster verlöre die äußere Schilderreihe.
 */
export const RAND = 8;

/** Nutzfläche eines A4-Bogens innerhalb des Druckrands. */
export const FLAECHE = {
  breite: SEITE.breite - 2 * RAND,
  hoehe: SEITE.hoehe - 2 * RAND,
} as const;

/**
 * Ein Schildformat in Millimetern.
 *
 * Millimeter und nicht „3 Spalten × 5 Zeilen": am Regal wird mit dem Lineal
 * gemessen, welches Schild in die Schiene passt, nicht ausgerechnet, wie oft
 * es auf ein Blatt geht. Wie viele auf den Bogen passen, ergibt sich daraus
 * von selbst.
 */
export interface SchildFormat {
  id: string;
  name: string;
  breite: number;
  hoehe: number;
}

/**
 * Kleinstes und größtes Maß, das ein Schild haben darf.
 *
 * 25 mm nach unten, weil ein Preisschild drei Angaben tragen muss:
 * Bezeichnung, Preis und Artikelnummer. Darunter geht das nur noch, indem
 * eine davon unleserlich klein wird oder wegfällt – dann ist es ein Etikett
 * und kein Preisschild. Nach oben die Nutzfläche eines A4-Bogens: was nicht
 * aufs Blatt passt, ließe sich anlegen, aber nie drucken.
 */
export const MASS_GRENZEN = {
  min: 25,
  maxBreite: FLAECHE.breite,
  maxHoehe: FLAECHE.hoehe,
} as const;

/**
 * Vorgaben, solange keine eigenen Größen gepflegt sind (Migration 039 legt
 * genau diese drei als Startwerte an). Sie stehen auch hier, damit der
 * Generator ohne eingespielte Migration nicht ohne Format dasteht.
 */
export const STANDARD_FORMATE: SchildFormat[] = [
  { id: "standard-klein", name: "Klein", breite: 48.5, hoehe: 40 },
  { id: "standard-mittel", name: "Mittel", breite: 64.5, hoehe: 56 },
  { id: "standard-gross", name: "Groß", breite: 97, hoehe: 70 },
];

/**
 * Raster eines Formats auf dem A4-Bogen.
 *
 * Abgerundet, nicht gestreckt: ein Schild, das 64,5 mm breit sein soll, ist
 * auf dem Papier 64,5 mm breit. Was rechts und unten übrig bleibt, ist Rand –
 * die Alternative wäre, die eingegebenen Maße stillschweigend zu verändern,
 * und dann passte das ausgeschnittene Schild nicht mehr in die Schiene.
 */
export function raster(format: SchildFormat) {
  const spalten = Math.max(1, Math.floor(FLAECHE.breite / format.breite));
  const zeilen = Math.max(1, Math.floor(FLAECHE.hoehe / format.hoehe));
  return {
    spalten,
    zeilen,
    proBogen: spalten * zeilen,
    /** Breite und Höhe des belegten Rasters – für die Schnittlinien. */
    rasterB: spalten * format.breite,
    rasterH: zeilen * format.hoehe,
  };
}

/** Wie viele Schilder dieses Formats auf einen A4-Bogen passen. */
export function proBogen(format: SchildFormat): number {
  return raster(format).proBogen;
}

/** Maß für die Anzeige: „64,5 × 56 mm". */
const massFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function formatMass(format: SchildFormat): string {
  return `${massFormat.format(format.breite)} × ${massFormat.format(format.hoehe)} mm`;
}

// --- Typografie --------------------------------------------------------------

/**
 * Schriftgrößen, aus der Schildgröße gerechnet – alle Angaben in Millimetern.
 *
 * Keine Tabelle mit festen Werten je Format mehr: seit die Maße frei
 * eingegeben werden, gibt es keine feste Liste von Formaten, für die man sie
 * pflegen könnte. Die Anteile sind stattdessen einmal festgelegt, und ein
 * doppelt so hohes Schild trägt doppelt so große Schrift.
 *
 * Die Anteile sind großzügig: ein Preisschild wird aus zwei Metern Entfernung
 * gelesen, nicht aus fünfzig Zentimetern. Weißraum, der nichts trägt, ist auf
 * einem 40-mm-Schild verschenkte Fläche.
 */
export function schildMasse(
  format: SchildFormat,
  optionen: { barcode?: boolean } = {},
) {
  const luft = klemme(format.hoehe * 0.055, 1.4, 4.5);
  const innenH = format.hoehe - 2 * luft;
  const innenB = format.breite - 2 * luft;

  /**
   * `k` nimmt den Preisblock zurück. Der Strichcode braucht Höhe, und die
   * kann nur von der Stelle kommen, die am meisten davon hat.
   */
  const anteile = (k: number, mitCode: boolean) => ({
    luft,
    innenH,
    innenB,
    /**
     * Höchstgröße der Bezeichnung. Zwei Zeilen, voll ausgeschrieben – passt
     * sie so nicht, setzt nameSatz() sie kleiner. Bewusst deutlich unter dem
     * Preis: gelesen wird aus der Entfernung der Betrag, die Bezeichnung erst
     * vor dem Regal.
     */
    name: klemme(innenH * 0.1, 1.8, 8),
    /** Wunschgröße des Euro-Betrags – die Breitenprüfung kann sie kürzen. */
    preis: klemme(innenH * 0.44 * k, 4, 40),
    vorher: klemme(innenH * 0.125 * k, 1.8, 10),
    prozent: klemme(innenH * 0.125 * k, 1.8, 10),
    kennung: klemme(innenH * 0.135, 1.8, 11),
    /** Label in der Fußzeile, etwas kleiner als die Artikelnummer. */
    label: klemme(innenH * 0.11, 1.6, 9),
    /** Symbol neben der Bezeichnung. */
    icon: klemme(innenH * 0.2, 3, 18),
    /** Stärke der beiden Haarlinien. */
    linie: klemme(format.hoehe * 0.008, 0.18, 0.5),
    /** Abstand der Haarlinien nach oben und unten. */
    linienLuft: luft * 0.45,
    /**
     * Höhe der Striche. 0 = kein Strichcode auf diesem Schild.
     *
     * Der Code steht in der Fußzeile neben der Artikelnummer und ist deshalb
     * etwas höher als deren Schrift, aber kein eigener Block mehr. Ein
     * Handscanner liest auch einen niedrigen Code, solange er gerade
     * draufhält – und ein Regalschild wird aus dreißig Zentimetern gescannt,
     * nicht über den Kassentisch gezogen.
     */
    barcode: mitCode ? klemme(innenH * 0.13, 2.6, 8) : 0,
    /**
     * Rand um die Striche. Auf dem roten Aktionsschild liegt darunter die
     * weiße Fläche, die der Scanner braucht; auf weißem Schild ist er
     * schlicht Abstand. Er wird auf beiden reserviert, damit rote und weiße
     * Schilder desselben Bogens gleich aufgebaut bleiben.
     */
    barcodeRand: mitCode ? klemme(innenH * 0.012, 0.3, 1.2) : 0,
  });

  if (!optionen.barcode) return anteile(1, false);

  /*
   * Den Preisblock so weit zurücknehmen, bis das voll besetzte Schild mit
   * Strichcode wieder in seine Höhe passt – statt einer zweiten Anteilstabelle
   * für „mit Code". hoehenBedarf() rechnet ohnehin schon, was gebraucht wird;
   * hier wird das Ergebnis endlich benutzt.
   */
  for (let k = 1; k >= 0.5; k -= 0.05) {
    const masse = anteile(k, true);
    if (hoehenBedarf(masse) <= innenH) return masse;
  }

  /*
   * Passt auch mit halbem Preis nicht: dann trägt dieses Format keinen
   * Strichcode. Lieber gar keiner als einer, der unten abgeschnitten aus dem
   * Schild läuft – ein halber Strichcode ist nicht „etwas schlechter lesbar",
   * sondern gar nicht lesbar. Der Aufrufer schreibt die Nummer dann als Text.
   */
  return anteile(1, false);
}

/** Zeilenabstand der Bezeichnung; steht hier, weil die Höhenrechnung ihn braucht. */
export const NAME_ZEILE = 1.12;

/** Innenabstand des Prozentfelds, in em seiner Schriftgröße (oben + unten). */
const PROZENT_LUFT = 0.44;

/**
 * Höhe, die ein voll besetztes Schild braucht – zweizeilige Bezeichnung,
 * Preis, beide Haarlinien und die Fußzeile.
 *
 * Steht hier und wird geprüft, weil die Anteile in `schildMasse()` sonst
 * stillschweigend zu groß werden könnten: der Überlauf einer Zelle fällt
 * nicht auf dem Bildschirm auf, sondern erst auf dem abgeschnittenen Papier.
 * Der Streichpreis zählt nicht mit – er steht neben dem Preis, nicht darunter,
 * und das Prozentfeld steht im Kopf neben der Bezeichnung.
 */
export function hoehenBedarf(masse: ReturnType<typeof schildMasse>): number {
  const trenner = 2 * (masse.linie + 2 * masse.linienLuft);
  return kopfHoehe(masse) + trenner + preiszeilenHoehe(masse) + fussHoehe(masse);
}

/**
 * Höhe der Fußzeile: Artikelnummer, Label und Strichcode stehen dort
 * nebeneinander, also gibt das höchste von dreien das Maß.
 */
export function fussHoehe(masse: ReturnType<typeof schildMasse>): number {
  return Math.max(
    masse.kennung,
    masse.label * 1.3,
    barcodeKasten(masse).hoehe,
  );
}

/**
 * Außenmaße des Strichcodekastens: die Striche plus ihr Rand. Auf farbigem
 * Grund ist dieser Kasten die weiße Fläche.
 */
export function barcodeKasten(
  masse: ReturnType<typeof schildMasse>,
  /** Breite der Striche selbst, aus barcodeMasse(). */
  striche = 0,
): { breite: number; hoehe: number; rand: number } {
  if (masse.barcode <= 0) return { breite: 0, hoehe: 0, rand: 0 };
  const rand = masse.barcodeRand;
  return {
    breite: striche > 0 ? striche + 2 * rand : 0,
    hoehe: masse.barcode + 2 * rand,
    rand,
  };
}

/**
 * Rangfolge in der Fußzeile: Artikelnummer, Strichcode, Label.
 *
 * Die Zeile trägt drei Dinge, die nicht alle zugleich ihre Wunschbreite
 * bekommen können. Die Reihenfolge ist keine Geschmacksfrage:
 *
 *  1. **Artikelnummer samt verdecktem Großhandelspreis.** Danach wird im
 *     Laden nachgeschlagen und danach kalkuliert; eine abgeschnittene Nummer
 *     ist eine falsche Nummer.
 *  2. **Strichcode.** Er muss scannbar sein, sonst ist er nichts – eine
 *     halbe Breite gibt es nicht, nur richtig oder weg.
 *  3. **Label.** „Neu" oder „Topseller" ist Werbung. Sie darf schrumpfen und
 *     zur Not entfallen; die beiden darüber dürfen es nicht.
 *
 * Wichtig dabei: Größe der Nummer und Breite des Codes werden **ohne** das
 * Label gerechnet. Ein gesetztes Label darf am übrigen Schild nichts
 * verändern, sonst stünde dieselbe Artikelnummer je nach Werbeaufkleber in
 * zwei verschiedenen Größen auf dem Bogen.
 */

/**
 * Anteil der Schildbreite, den der Strichcode höchstens bekommt.
 *
 * Er steht neben der Artikelnummer und nicht unter ihr: ein eigener Block
 * kostete Höhe, die der Preis besser braucht, und schob dem Schild einen
 * vierten Streifen unter. Der Rest bleibt der Nummer – genug für
 * „110002#077" in lesbarer Größe.
 */
const BARCODE_ANTEIL = 0.55;

/**
 * Anteil der Schildbreite, der der Artikelnummer auf jeden Fall bleibt.
 *
 * Ohne diese Reserve nähme der Strichcode ihr die ganze Zeile, und weil die
 * Zelle überstehenden Inhalt abschneidet, stünde am Regal „110002#0" – eine
 * Nummer, die es nicht gibt. Lieber kleinere Ziffern als falsche.
 */
const KENNUNG_ANTEIL = 0.28;

/**
 * Breite des Strichcodes und seiner Module in Millimetern.
 *
 * Die Modulbreite folgt aus dem freien Platz und nicht umgekehrt: ein
 * Strichcode, der breiter wäre als sein Platz, würde beschnitten, und ein
 * beschnittener Strichcode ist keiner. Nach oben das Nennmaß der Norm – auf
 * einem 97-mm-Schild müssen die Striche nicht mitwachsen, gelesen wird ohnehin
 * aus dreißig Zentimetern.
 *
 * Kennt das Label nicht: siehe Rangfolge oben.
 *
 * `modul` unter MODUL_MIN heißt: gedruckt wird er, aber ob jeder Scanner ihn
 * nimmt, steht dahin – die Werkbank weist darauf hin. Unter MODUL_HART ist es
 * kein Strichcode mehr, sondern ein grauer Streifen; dann zeichnet der
 * Aufrufer keinen.
 */
export function barcodeMasse(
  module: number,
  masse: ReturnType<typeof schildMasse>,
): { breite: number; modul: number } {
  const frei =
    masse.innenB -
    masse.innenB * KENNUNG_ANTEIL -
    masse.luft * 0.7 -
    2 * masse.barcodeRand;
  const platz = Math.min(masse.innenB * BARCODE_ANTEIL, frei);
  const modul = Math.min(MODUL_NENN, Math.max(0, platz) / module);
  return { breite: modul * module, modul };
}

/** Taugt der errechnete Strichcode noch etwas, oder besser gar keinen? */
export function strichcodeTaugt(modul: number): boolean {
  return modul >= MODUL_HART;
}

/** Was in der Fußzeile steht und wie breit es ist. */
export interface FussAufteilung {
  /** Artikelnummer samt verdecktem Code, ggf. mit Klartext-Rückfall. */
  kennung: string;
  kennungGroesse: number;
  /**
   * Die Barcodenummer als Text, weil sie kein EAN ist – sonst null. Steckt
   * bereits in `kennung`; die Aufrufer zeichnen sie als eigenes Element, weil
   * sie zurückgenommen gesetzt wird.
   */
  klartext: string | null;
  /** Strichcode, falls einer gezeichnet wird. */
  code: Barcode | null;
  balken: { breite: number; modul: number } | null;
  kasten: { breite: number; hoehe: number; rand: number } | null;
  /** Schriftgröße des Labels. 0 = kein Platz, es entfällt. */
  labelGroesse: number;
  /** Label ist gesetzt, passt aber nicht mehr. */
  labelEntfaellt: boolean;
}

/**
 * Die ganze Fußzeile in einem Rutsch – Rangfolge inklusive.
 *
 * Druckbogen, Vorschau und Werkbank brauchen dieselben Zahlen: der Bogen zum
 * Zeichnen, die Vorschau, damit sie dasselbe zeigt, und die Werkbank, um zu
 * warnen. Dreimal dieselbe Reihenfolge von Hand hieße, dass sie beim nächsten
 * Eingriff an zwei von drei Stellen nachgezogen wird.
 */
export function fussAufteilung(
  schild: Pick<Preisschild, "sku" | "code" | "barcode" | "label">,
  masse: ReturnType<typeof schildMasse>,
): FussAufteilung {
  const roh = masse.barcode > 0 ? barcode(schild.barcode) : null;
  const balken = roh ? barcodeMasse(roh.breite, masse) : null;
  const code = balken && strichcodeTaugt(balken.modul) ? roh : null;
  const kasten = code && balken ? barcodeKasten(masse, balken.breite) : null;
  const belegt = kasten ? kasten.breite + masse.luft * 0.7 : 0;

  /*
   * Klartext der Barcodenummer nur, wenn sie **kein** EAN ist. Wurde der Code
   * bloß aus Platzmangel weggelassen, hülfe die Ziffernfolge niemandem: sie
   * ist dreizehnstellig und stünde in Ameisengröße da.
   */
  const klartext = roh ? null : (schild.barcode ?? null);
  const kennung = schildKennung(schild.sku, schild.code, klartext);
  const kennungGroesse = kennungSchriftgroesse(kennung, masse, belegt);
  const groesse = labelGroesse(
    schild.label,
    masse,
    masse.innenB - kennungBreite(kennung, kennungGroesse) - belegt,
  );

  return {
    kennung,
    kennungGroesse,
    klartext,
    code,
    balken,
    kasten,
    labelGroesse: groesse,
    labelEntfaellt: Boolean(schild.label) && groesse <= 0,
  };
}

/**
 * Breite eines Zeichens der Fußzeile in em.
 *
 * 0,58: Ziffern in halbfetter Groteske messen rund 0,56, das „#" ist breiter.
 * Mit 0,56 lief die Zeile um ein, zwei Pixel über und die Zelle schnitt die
 * letzte Ziffer ab. Lieber eine Spur kleiner setzen.
 */
export const KENNUNG_EM = 0.58;

/** Breite der Artikelnummer bei gegebener Schriftgröße, in Millimetern. */
export function kennungBreite(text: string, groesse: number): number {
  return Math.max(1, text.length) * KENNUNG_EM * groesse;
}

/**
 * Höhe der Preiszeile: der Preis, oder der Nebenblock daneben, falls er
 * höher ausfällt. Streichpreis und Prozentfeld stehen dort untereinander und
 * sind zusammen fast so hoch wie der Preis selbst.
 */
export function preiszeilenHoehe(masse: ReturnType<typeof schildMasse>): number {
  const neben =
    masse.vorher + masse.luft * 0.3 + masse.prozent * (1 + PROZENT_LUFT);
  return Math.max(masse.preis, neben);
}

/**
 * Feste Höhe des Kopfbereichs: zwei Zeilen Bezeichnung, auch wenn nur eine
 * gebraucht wird.
 *
 * Ohne feste Höhe rutschte der Preis mit der Länge der Bezeichnung nach oben
 * und unten. Auf dem Bogen stünden die Preise dann auf einem Dutzend
 * verschiedener Höhen – nebeneinander sieht das aus wie schief eingeklebt.
 * Die Höhe kostet nichts, weil die Platzrechnung ohnehin vom zweizeiligen
 * Fall ausgeht.
 */
export function kopfHoehe(masse: ReturnType<typeof schildMasse>): number {
  return Math.max(
    masse.name * NAME_ZEILE * 2,
    masse.prozent * (1 + PROZENT_LUFT),
    masse.icon,
  );
}

/** Schrift aller Schilder. Systemschrift, keine Webfont – siehe Druckbogen. */
export const SCHRIFT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

/** Strichstärke der Bezeichnung; die Messung in nameSatz() muss sie kennen. */
export const NAME_GEWICHT = 600;

/**
 * Freie Breite der Bezeichnung in Millimetern – die Innenbreite abzüglich
 * eines Symbols davor. Ein Hauch Reserve, weil Bildschirm und Druckertreiber
 * die Laufweite nicht auf den Hundertstelmillimeter gleich setzen.
 */
export function nameBreite(
  masse: ReturnType<typeof schildMasse>,
  mitIcon: boolean,
): number {
  const icon = mitIcon ? masse.icon + masse.luft * 0.7 : 0;
  return (masse.innenB - icon) * 0.97;
}

/**
 * Satz der Bezeichnung: zwei Zeilen, voll ausgeschrieben.
 *
 * Zeile 1 wird bis zum Rand gefüllt. Passt das nächste Wort nicht mehr ganz
 * hinein, wird es dort getrennt – so viel, wie bis zum Rand geht, dann ein
 * „-", der Rest in Zeile 2. Vorher rutschte das ganze Wort in die zweite
 * Zeile, ließ die erste halb leer und schnitt die zweite mit „…" ab: aus
 * „Cimar 15W Magnetisches Fahrradlicht" wurde „Magnetisches…".
 *
 * Trennt nach Zeichen und nicht nach Silben – eine Silbentrennung bräuchte
 * ein Wörterbuch, und `hyphens: auto` trennt je nach Browser gar nicht.
 * Mindestens drei Zeichen vorn und zwei hinten, sonst stünde ein einsames
 * „M-" am Zeilenende.
 *
 * Reicht der Platz auch so nicht, wird die Schrift in Schritten kleiner,
 * bis auf die Hälfte. Erst darunter wird gekürzt – „voll ausgeschrieben"
 * geht vor „groß".
 *
 * Gemessen wird in em (`messen` liefert die Breite eines Texts bei
 * Schriftgröße 1), so gilt dieselbe Messung für jede Schriftgröße.
 *
 * ACHTUNG: Die Funktion wird per `toString()` in den Druckbogen eingebettet
 * und läuft dort im Browser. Sie darf deshalb nichts außerhalb ihres eigenen
 * Körpers verwenden – keine Konstanten, keine Hilfsfunktionen, keine Importe.
 */
export function nameSatz(
  text: string,
  breiteMm: number,
  basisMm: number,
  messen: (text: string) => number,
): { zeilen: string[]; groesse: number } {
  const MIN_VORNE = 3;
  const MIN_HINTEN = 2;
  const MIN_ANTEIL = 0.5;

  function umbrechen(woerter: string[], breiteEm: number): string[] | null {
    if (woerter.length === 0) return [];
    let zeile1 = "";
    let rest: string | null = null;
    let i = 0;
    for (; i < woerter.length; i++) {
      const probe = zeile1 ? zeile1 + " " + woerter[i] : woerter[i];
      if (messen(probe) <= breiteEm) {
        zeile1 = probe;
        continue;
      }
      const zeichen = Array.from(woerter[i]);
      for (let n = zeichen.length - MIN_HINTEN; n >= MIN_VORNE; n--) {
        // Nicht mitten in einer Zahl: aus „1500W" würde sonst „150-" und „0W".
        if (/\d/.test(zeichen[n - 1]) && /\d/.test(zeichen[n])) continue;
        const vorne = zeichen.slice(0, n).join("");
        // Steht an der Stelle schon ein Bindestrich, kein zweiter dazu.
        const kandidat =
          (zeile1 ? zeile1 + " " : "") + vorne + (vorne.slice(-1) === "-" ? "" : "-");
        if (messen(kandidat) <= breiteEm) {
          zeile1 = kandidat;
          rest = zeichen.slice(n).join("");
          break;
        }
      }
      break;
    }
    if (i >= woerter.length) return [zeile1];
    if (!zeile1) return null;
    const zeile2 = (rest !== null ? [rest] : [])
      .concat(woerter.slice(rest !== null ? i + 1 : i))
      .join(" ");
    return messen(zeile2) <= breiteEm ? [zeile1, zeile2] : null;
  }

  const woerter = String(text).trim().split(/\s+/).filter(Boolean);
  for (let anteil = 1; anteil >= MIN_ANTEIL - 1e-9; anteil -= 0.05) {
    const groesse = basisMm * anteil;
    const zeilen = umbrechen(woerter, breiteMm / groesse);
    if (zeilen) return { zeilen: zeilen, groesse: groesse };
  }

  // Notfall: selbst bei halber Größe zu lang. Von hinten kürzen, bis es passt.
  const klein = basisMm * MIN_ANTEIL;
  const alle = Array.from(woerter.join(" "));
  for (let laenge = alle.length - 1; laenge > 0; laenge--) {
    const gekuerzt = (alle.slice(0, laenge).join("").trim() + "…").split(/\s+/);
    const satz = umbrechen(gekuerzt, breiteMm / klein);
    if (satz) return { zeilen: satz, groesse: klein };
  }
  return { zeilen: [woerter.join(" ")], groesse: klein };
}

/**
 * Schriftfarbe auf einem Label: schwarz auf hellen, weiß auf dunklen
 * Flächen. Relative Leuchtdichte nach WCAG, Schwelle beim Punkt gleichen
 * Kontrasts zu beiden.
 */
export function labelSchrift(farbe: string): "#000" | "#fff" {
  const hex = /^#?([0-9a-f]{6})$/i.exec(farbe)?.[1];
  if (!hex) return "#fff";
  const kanal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
  return l > 0.179 ? "#000" : "#fff";
}

/** Innenabstand des Labels, in em seiner Schrift (links + rechts). */
export const LABEL_LUFT = 0.9;

/**
 * Breite eines Labels bei gegebener Schriftgröße, in Millimetern.
 *
 * 0,72 em je Zeichen, und damit **absichtlich großzügig**: gemessen sind es
 * rund 0,715 für fette Versalien samt Sperrung. Die Schätzung darf nach oben
 * daneben liegen – dann bleibt neben dem Label etwas Luft. Liegt sie nach
 * unten daneben, schneidet die Zelle ab, was nicht mehr hineinpasst.
 */
export function labelBreite(
  label: SchildLabel | null,
  groesse: number,
  masse: ReturnType<typeof schildMasse>,
): number {
  if (!label || groesse <= 0) return 0;
  const em = Array.from(label.name.toUpperCase()).length * 0.72 + LABEL_LUFT;
  return em * groesse + masse.luft * 0.7;
}

/**
 * Schriftgröße des Labels, auf den übrig gebliebenen Platz begrenzt.
 *
 * Das Label ist das Letzte in der Rangfolge (siehe dort): Artikelnummer und
 * Strichcode haben ihre Breite schon genommen, hier wird verteilt, was noch
 * da ist. Bleibt weniger als die halbe Wunschgröße, gibt es kein Label – ein
 * „TOPSELLER" in Ameisengröße liest am Regal niemand, es nähme der
 * Artikelnummer aber weiter Platz weg.
 */
export function labelGroesse(
  label: SchildLabel | null,
  masse: ReturnType<typeof schildMasse>,
  /** Restbreite der Fußzeile, Abstand eingerechnet. */
  frei: number,
): number {
  if (!label) return 0;
  const em = Array.from(label.name.toUpperCase()).length * 0.72 + LABEL_LUFT;
  const passend = (frei - masse.luft * 0.7) / em;
  if (passend >= masse.label) return masse.label;
  return passend >= masse.label * 0.5 ? passend : 0;
}

function klemme(wert: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, wert));
}

/**
 * Der Preis in zwei Teilen: Euro groß, Cent hochgestellt.
 *
 * Handelsübliche Preisauszeichnung, und hier nicht als Zierde: „12" in voller
 * Größe und „99" halb so groß brauchen zusammen weniger Platz als „12,99" –
 * der Euro-Betrag kann dadurch rund anderthalbmal so groß gesetzt werden wie
 * bei durchgehender Schrift. Genau die Zahl liest man aus der Entfernung.
 */
export function preisTeile(wert: number): { euro: string; cent: string } {
  const cent = Math.round(Math.abs(wert) * 100);
  const ganz = Math.floor(cent / 100);
  const rest = cent % 100;
  return {
    euro: new Intl.NumberFormat("de-DE").format(Math.sign(wert) < 0 ? -ganz : ganz),
    cent: String(rest).padStart(2, "0"),
  };
}

/**
 * Relative Zeichenbreiten fetter Groteskschrift, grob gemessen. Genauer geht
 * es im Browser nicht, ohne den Text erst zu setzen – und das Ergebnis muss
 * nur verhindern, dass ein langer Preis aus dem Schild läuft.
 */
const EM_ZIFFER = 0.58;
const EM_TRENNER = 0.3;

/** Breite einer Ziffernfolge in em. */
function emBreite(text: string): number {
  let breite = 0;
  for (const zeichen of text) {
    breite += zeichen === "." || zeichen === "," ? EM_TRENNER : EM_ZIFFER;
  }
  return breite;
}

/** Anteil, in dem Cent und Euro-Zeichen kleiner gesetzt werden als der Betrag. */
export const CENT_ANTEIL = 0.52;

/**
 * Breite des Blocks rechts vom Preis: Streichpreis oben, Prozentfeld darunter.
 *
 * Neben dem Preis und nicht darunter, weil eine eigene Zeile Höhe kostete, die
 * auf einem 40-mm-Schild der Preis besser gebrauchen kann. Und untereinander
 * statt nebeneinander, weil beide zusammen in einer Reihe breiter wären als
 * der Preis selbst.
 *
 * Das Prozentfeld stand vorher im Kopf neben der Bezeichnung. Dort nahm es ihr
 * ein Viertel der Zeile weg – aus „Akku-Bohrschrauber 18 V" wurde
 * „Akku-Bohrsch…", und zwar ausgerechnet bei den Angeboten, die am besten
 * lesbar sein sollten.
 */
export function nebenblockBreite(
  vorher: number | null,
  prozent: number | null,
  masse: ReturnType<typeof schildMasse>,
): number {
  if (vorher === null && prozent === null) return 0;

  let breite = 0;
  if (vorher !== null) {
    const { euro, cent } = preisTeile(vorher);
    // „15,99 €" – Betrag, Komma, Cent, Leerzeichen, Zeichen.
    const em = emBreite(euro) + EM_TRENNER + emBreite(cent) + 0.3 + 0.62;
    breite = Math.max(breite, em * masse.vorher);
  }
  if (prozent !== null) {
    // „−28 %" plus der Innenabstand des Feldes.
    const em = 0.62 + emBreite(String(prozent)) + 0.3 + 0.62 + 0.8;
    breite = Math.max(breite, em * masse.prozent);
  }
  return breite + PREIS_ABSTAND * masse.luft;
}

/**
 * Abstand zwischen Preis und Nebenblock, als Vielfaches der Schildluft.
 *
 * Großzügiger als die übrigen Abstände: der Streichpreis stand mit dem
 * Eurozeichen des gültigen Preises fast auf Tuchfühlung, und beim
 * Vorbeigehen verschmolz das zu einer einzigen langen Zahl. Der Abstand ist
 * hier keine Zierde, sondern die Trennung zweier Preise.
 */
export const PREIS_ABSTAND = 1.1;

/**
 * Schriftgröße des Preises, auf die freie Schildbreite begrenzt.
 *
 * Ohne diese Prüfung stünde „1.299,00 €" auf einem schmalen Schild über den
 * Rand hinaus – abgeschnitten wäre daraus „1.299,0", also ein falscher Preis.
 * Lieber kleiner als falsch.
 */
export function preisSchriftgroesse(
  wert: number,
  masse: ReturnType<typeof schildMasse>,
  /** Von einem danebenstehenden Streichpreis belegte Breite. */
  belegt = 0,
): number {
  const { euro, cent } = preisTeile(wert);
  // Betrag + Abstand + Cent + Abstand + Euro-Zeichen, alles in em des Betrags.
  const gesamt =
    emBreite(euro) +
    0.08 +
    emBreite(cent) * CENT_ANTEIL +
    0.12 +
    0.62 * CENT_ANTEIL;
  // Mindestens ein Drittel der Wunschgröße: lieber ragt ein Streichpreis in
  // den Rand, als dass der gültige Preis unleserlich klein wird.
  const frei = Math.max(masse.innenB - belegt, masse.innenB / 3);
  return Math.min(masse.preis, frei / gesamt);
}

/**
 * Schriftgröße der Fußzeile, auf die Schildbreite begrenzt. Dieselbe
 * Begründung wie beim Preis – nur fiele hier eine abgeschnittene
 * Artikelnummer erst an der Kasse auf.
 */
export function kennungSchriftgroesse(
  text: string,
  masse: ReturnType<typeof schildMasse>,
  /**
   * Vom Strichcode rechts daneben belegte Breite. Das Label zählt hier
   * **nicht** mit – es kommt nach der Nummer dran, siehe Rangfolge.
   */
  belegt = 0,
): number {
  const breite = Math.max(1, text.length) * KENNUNG_EM;
  /*
   * Kein großzügiger Mindestplatz mehr: seit der Strichcode in derselben
   * Zeile steht, wäre eine Untergrenze über dem tatsächlich freien Platz
   * genau das, was die Zelle abschneidet – die Schrift wäre für eine Breite
   * gesetzt, die es nicht gibt. Die Reserve steckt stattdessen in
   * barcodeMasse(): der Code nimmt sich nur, was die Nummer übrig lässt.
   * Der Rest hier ist nur ein Riegel gegen Division durch fast null.
   */
  const frei = Math.max(masse.innenB - belegt, masse.innenB * 0.1);
  return Math.min(masse.kennung, frei / breite);
}

// --- Großhandelscode ---------------------------------------------------------

/**
 * Mindestlänge des verdeckten Codes.
 *
 * 0,77 € ergäbe sonst „#77", und das liest sich wie 77 Euro. Mit führender
 * Null steht dort „#077": drei Stellen heißen immer Euro-Euro-Cent-Cent,
 * gelesen wird von hinten. Für den Kunden bleibt es eine Ziffernfolge.
 */
const CODE_STELLEN = 3;

/**
 * Großhandelspreis als verdeckter Code: 12,99 € wird zu „1299", 0,77 € zu
 * „077".
 *
 * Kein Euro-Zeichen, kein Komma, kein Punkt – die Zahl steht als Anhängsel
 * hinter der Artikelnummer („123123#1299") und soll im Vorbeigehen wie ein
 * Teil der Nummer aussehen. Wer den Schlüssel kennt, liest den
 * Großhandelspreis ab; wer ihn nicht kennt, sieht eine Nummer.
 *
 * Es ist der **Großhandels-**, nicht der Einkaufspreis. Der Einkaufspreis
 * (Migration 047) steht in `product_costs` und wird nirgends gedruckt – ihn
 * hier einzusetzen hieße, dass zwei Schilder im selben Regal unter demselben
 * „#" verschiedene Zahlen meinen, ohne dass man es ihnen ansieht.
 *
 * null bei 0 oder ohne Wert: ein „#000" hinter der Nummer wäre kein
 * Geheimnis, sondern eine offensichtliche Lücke.
 */
export function ghCode(preis: number | string | null | undefined): string | null {
  if (preis === null || preis === undefined || preis === "") return null;
  const cent = Math.round(toNumber(preis) * 100);
  if (!Number.isFinite(cent) || cent <= 0) return null;
  return String(cent).padStart(CODE_STELLEN, "0");
}

/**
 * Symbol automatisch vorschlagen, wenn der Artikelname mit dem Namen eines
 * vorhandenen Symbols beginnt – "LEGO City Polizeiauto" bei einem Symbol
 * "LEGO", ohne dass die Marke hier irgendwo als Zeichenkette steht. Ein
 * später hochgeladenes "Bruder"-Logo greift genauso, ohne Codeänderung: die
 * Zuordnung steht allein in der Symbolbibliothek.
 *
 * Nur ein Vorschlag beim Hinzufügen zur Werkbank – das Dropdown der Zeile
 * bleibt danach frei änderbar, falls der Treffer einmal nicht passt.
 */
export function markenSymbol(
  name: string,
  icons: { id: string; name: string }[],
): string | null {
  const text = name.trim().toLowerCase();
  const treffer = icons.find((icon) => {
    const marke = icon.name.trim().toLowerCase();
    if (!marke || !text.startsWith(marke)) return false;
    // Wortgrenze danach prüfen: "LEGO" soll nicht auf "Legoland" zuschlagen.
    const danach = text[marke.length];
    return danach === undefined || !/[a-zäöüß0-9]/.test(danach);
  });
  return treffer?.id ?? null;
}

/**
 * Fußzeile des Schilds als reiner Text: Artikelnummer, verdeckter Code und –
 * nur als Rückfall – die Barcodenummer im Klartext.
 *
 * Der Klartext steht hier ausschließlich dann, wenn aus dem Barcode **kein**
 * Strichbild wurde (hauseigene Nummer, die kein EAN ist, oder ein Format, auf
 * dem der Code keinen Platz hat). Wo Striche stehen, steht die Nummer schon
 * darunter; zweimal wäre sie Platzverschwendung auf dem Schild, das am
 * wenigsten davon hat.
 *
 * Wird zum Messen der Schriftgröße gebraucht – gezeichnet wird die Zeile in
 * mehreren Teilen, weil der verdeckte Code eine eigene Farbe trägt.
 */
export function schildKennung(
  sku: string,
  code: string | null,
  klartext?: string | null,
): string {
  const links = code ? `${sku}#${code}` : sku;
  if (!klartext) return links;
  return kennungTrenner(sku, code) ? `${links} · ${klartext}` : klartext;
}

/**
 * Steht links von der Barcodenummer überhaupt etwas, wovon sie getrennt
 * werden müsste?
 *
 * Beim freien Generator (/admin/preisschilder/frei) ist die Artikelnummer
 * optional. Ohne sie begänne die Fußzeile mit „· 4006…" – ein Trennzeichen
 * ohne etwas davor, das am Regal wie ein Druckfehler aussieht.
 */
export function kennungTrenner(sku: string, code: string | null): boolean {
  return Boolean(sku.trim() || code);
}

// --- Preis und Reduzierung ---------------------------------------------------

/**
 * Preis, Vorher-Preis und Prozentsatz eines Schilds.
 *
 * Maßgeblich ist derselbe `reduzierung()`-Test wie im Shop: ein Streichpreis
 * ist erst eine Reduzierung, wenn gerundet mehr als 0 % übrig bleiben. Sonst
 * stünde am Regal ein rotes Schild für einen Cent Unterschied.
 */
export function schildPreis(preis: number, listPrice: number | null | undefined) {
  // Der Schildpreis ist schon der Ladenpreis (ersatzweise die Staffel) – er
  // ist Anzeige und Bezug zugleich.
  const r = reduzierung(listPrice, preis, preis);
  return {
    preis,
    vorher: r?.vorher ?? null,
    prozent: r?.prozent ?? null,
  };
}

/** Ein Schild ist reduziert – und damit rot – wenn ein Vorher-Preis übrig blieb. */
export function istReduziert(schild: Pick<Preisschild, "vorher">): boolean {
  return schild.vorher !== null;
}

// --- Farben ------------------------------------------------------------------

/**
 * Aktionsrot der reduzierten Schilder.
 *
 * Nicht das Markenrot #a02020: darauf ist schwarze Schrift kaum zu lesen, und
 * schwarz auf rot ist hier ausdrücklich gewünscht. Dieses hellere Signalrot
 * trägt schwarze Ziffern und bleibt im Regal von weitem ein Aktionsschild.
 */
export const AKTIONSROT = "#e2001a";

/** Rot des Großhandelscodes auf weißem Schild. */
export const CODEROT = "#c00000";
