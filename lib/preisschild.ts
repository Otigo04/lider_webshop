/**
 * Preisschilder fürs Regal – Rechenregeln, Maße und Typografie.
 *
 * Bewusst ohne Server-Importe: dieselben Regeln gelten in der Werkbank
 * (components/admin/preisschild-werkbank.tsx, Client) und im Druckbogen
 * (lib/preisschild-bogen.ts, Server). Stünde der Großhandelscode an zwei
 * Stellen, liefe die Vorschau über kurz oder lang neben dem Papier her.
 */

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
export function schildMasse(format: SchildFormat) {
  const luft = klemme(format.hoehe * 0.055, 1.4, 4.5);
  const innenH = format.hoehe - 2 * luft;
  const innenB = format.breite - 2 * luft;

  return {
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
    preis: klemme(innenH * 0.38, 4, 40),
    vorher: klemme(innenH * 0.125, 1.8, 10),
    prozent: klemme(innenH * 0.125, 1.8, 10),
    kennung: klemme(innenH * 0.135, 1.8, 11),
    /** Label in der Fußzeile, etwas kleiner als die Artikelnummer. */
    label: klemme(innenH * 0.11, 1.6, 9),
    /** Symbol neben der Bezeichnung. */
    icon: klemme(innenH * 0.2, 3, 18),
    /** Stärke der beiden Haarlinien. */
    linie: klemme(format.hoehe * 0.008, 0.18, 0.5),
    /** Abstand der Haarlinien nach oben und unten. */
    linienLuft: luft * 0.45,
  };
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
  return (
    kopfHoehe(masse) +
    trenner +
    preiszeilenHoehe(masse) +
    Math.max(masse.kennung, masse.label * 1.3)
  );
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
 * Breite des Labels in der Fußzeile, in Millimetern. Geschätzt wie der Preis:
 * es muss nur verhindern, dass die Artikelnummer unter das Label läuft.
 */
export function labelBreite(
  label: SchildLabel | null,
  masse: ReturnType<typeof schildMasse>,
): number {
  if (!label) return 0;
  const em = Array.from(label.name.toUpperCase()).length * 0.68 + LABEL_LUFT;
  return em * masse.label + masse.luft * 0.7;
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
  return breite + masse.luft * 0.7;
}

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
  /** Vom Label rechts daneben belegte Breite. */
  belegt = 0,
): number {
  const breite = Math.max(1, text.length) * 0.56;
  const frei = Math.max(masse.innenB - belegt, masse.innenB / 2);
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
 * Teil der Nummer aussehen. Wer den Schlüssel kennt, liest den Einkaufspreis
 * ab; wer ihn nicht kennt, sieht eine Nummer.
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

/** Artikelnummer und Code, wie sie zusammen auf dem Schild stehen. */
export function schildKennung(sku: string, code: string | null): string {
  return code ? `${sku}#${code}` : sku;
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
  const r = reduzierung(listPrice, preis);
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
