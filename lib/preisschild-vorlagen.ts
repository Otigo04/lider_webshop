/**
 * Vorlagen-Schilder – Schilder ohne Preis: „NEUHEIT", „STARK REDUZIERT" …
 *
 * Für den Aufsteller, die Palette, das Regalende: ein Schild, das eine
 * Aussage trägt und keine Zahl. Bewusst ohne Server-Importe, wie
 * `lib/preisschild.ts`: Vorschau (Client) und Druckbogen (Server) rechnen
 * dieselbe Aufteilung. Zwei Rechenwege wären eine Vorschau, die ungefähr ist.
 */

import { AKTIONSROT, type SchildFormat } from "@/lib/preisschild";

/** Flächen oder Rahmen: gefüllt trägt die Farbe das Schild, Rahmen nur den Rand. */
export type VorlagenStil = "flaeche" | "rahmen";

/** Ein Vorlagen-Schild, wie es gezeichnet wird. */
export interface Vorlage {
  /** Haupttext; ein Zeilenumbruch erzwingt zwei Zeilen */
  text: string;
  /** Kleine Zeile darunter, leer = keine */
  zusatz: string;
  /** Farbe der Fläche bzw. des Rahmens, #rrggbb */
  farbe: string;
  stil: VorlagenStil;
}

/** Eine fertige Auswahl-Vorlage. */
export interface VorlagenEintrag extends Vorlage {
  id: string;
}

/**
 * Farben aus der Markenpalette. Wenige und bewusst: auf einem Regal stehen
 * Schilder nebeneinander, und was nicht zusammenpasst, sieht nach Zufall aus.
 */
export const VORLAGEN_FARBEN = [
  { name: "Aktionsrot", farbe: AKTIONSROT },
  { name: "Wappenblau", farbe: "#284078" },
  { name: "Grün", farbe: "#059669" },
  { name: "Gold", farbe: "#b8721c" },
  { name: "Anthrazit", farbe: "#1f2937" },
  { name: "Schwarz", farbe: "#000000" },
] as const;

const [ROT, BLAU, GRUEN, GOLD, ANTHRAZIT] = VORLAGEN_FARBEN.map((f) => f.farbe);

export const VORLAGEN: VorlagenEintrag[] = [
  { id: "neuheit", text: "NEUHEIT", zusatz: "", farbe: GRUEN, stil: "flaeche" },
  { id: "neu", text: "NEU", zusatz: "im Sortiment", farbe: GRUEN, stil: "flaeche" },
  { id: "wieder-da", text: "WIEDER DA", zusatz: "", farbe: BLAU, stil: "flaeche" },
  { id: "reduziert", text: "%\nREDUZIERT\n%", zusatz: "", farbe: ROT, stil: "flaeche" },
  {
    id: "stark-reduziert",
    text: "STARK REDUZIERT",
    zusatz: "Nur solange der Vorrat reicht",
    farbe: ROT,
    stil: "flaeche",
  },
  { id: "sonderpreis", text: "SONDERPREIS", zusatz: "", farbe: ROT, stil: "flaeche" },
  { id: "aktion", text: "AKTION", zusatz: "", farbe: ROT, stil: "rahmen" },
  { id: "angebot", text: "ANGEBOT", zusatz: "", farbe: BLAU, stil: "flaeche" },
  { id: "topseller", text: "TOPSELLER", zusatz: "", farbe: GOLD, stil: "flaeche" },
  { id: "bestpreis", text: "BESTPREIS", zusatz: "", farbe: GRUEN, stil: "rahmen" },
  {
    id: "letzte-stuecke",
    text: "LETZTE STÜCKE",
    zusatz: "",
    farbe: ANTHRAZIT,
    stil: "flaeche",
  },
  { id: "restposten", text: "RESTPOSTEN", zusatz: "", farbe: ANTHRAZIT, stil: "rahmen" },
];

// --- Aufteilung --------------------------------------------------------------

/**
 * Zeichenbreiten fetter Großbuchstaben (Helvetica/Arial Bold) in em. Eine
 * Tabelle statt eines Mittelwerts: ein „W" ist doppelt so breit wie ein „I",
 * und mit einem Durchschnitt liefen „ANGEBOT" und „WIEDER" über den Rand,
 * während „LIIII" Platz verschenkte. Messen kann der Server nicht, also wird
 * geschätzt – und zwar nach oben.
 */
const BREITEN: Record<string, number> = {
  A: 0.722, B: 0.722, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778,
  H: 0.722, I: 0.278, J: 0.556, K: 0.722, L: 0.611, M: 0.833, N: 0.722,
  O: 0.778, P: 0.667, Q: 0.778, R: 0.722, S: 0.667, T: 0.611, U: 0.722,
  V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611, Ä: 0.722, Ö: 0.778,
  Ü: 0.722, ß: 0.611, " ": 0.278, "%": 0.889, "&": 0.722, "!": 0.333,
  "-": 0.333, "+": 0.584, "/": 0.278, ".": 0.278, ",": 0.278,
};
const STANDARD_BREITE = 0.62;
/** Reserve für Laufweite, Rundung und Ersatzschrift. */
const SICHERHEIT = 1.07;

/** Breite eines Textes in em der Schriftgröße (fett, geschätzt nach oben). */
export function textBreiteEm(text: string, laufweite = 0.02): number {
  let summe = 0;
  for (const z of text) {
    const w = BREITEN[z.toUpperCase()] ?? (/\d/.test(z) ? 0.556 : STANDARD_BREITE);
    summe += w + laufweite;
  }
  return summe * SICHERHEIT;
}

const ZEILE = 1.05;

function klemme(wert: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, wert));
}

function breitesteEm(zeilen: string[], laufweite = 0.02): number {
  return Math.max(0.1, ...zeilen.map((z) => textBreiteEm(z, laufweite)));
}

/**
 * Gleichmäßigster Umbruch an einem Leerzeichen. Keine Zeile unter drei
 * Zeichen und keine unter 40 % der anderen: ein einzelnes „%" oder „DA" in
 * der zweiten Zeile sieht nach einem Fehler aus, nicht nach einem Umbruch.
 */
function besterUmbruch(text: string, ausgewogen = true): string[] | null {
  let beste: string[] | null = null;
  let abstand = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== " ") continue;
    const a = text.slice(0, i).trim();
    const b = text.slice(i + 1).trim();
    if (!a || !b) continue;
    if (ausgewogen) {
      const kurz = Math.min(a.length, b.length);
      const lang = Math.max(a.length, b.length);
      if (kurz < 3 || kurz < lang * 0.4) continue;
    }
    const d = Math.abs(textBreiteEm(a) - textBreiteEm(b));
    if (d < abstand) {
      abstand = d;
      beste = [a, b];
    }
  }
  return beste;
}

/**
 * Schriftfarbe auf einer Fläche. Weiß, solange die Fläche nicht wirklich hell
 * ist: der Text ist groß und fett, da reicht ein Kontrast von etwa 3:1 – und
 * Schwarz auf Grün oder Gold, wie `labelSchrift()` es für kleine Label wählt,
 * sieht auf einem Regalschild falsch aus.
 */
export function schriftAuf(farbe: string): "#000" | "#fff" {
  const hex = /^#?([0-9a-f]{6})$/i.exec(farbe)?.[1];
  if (!hex) return "#fff";
  const kanal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
  // Kontrast zu Weiß ≥ 3 ⇔ L ≤ 0.30; darüber ist Schwarz die bessere Wahl.
  return l <= 0.3 ? "#fff" : "#000";
}

/** Fertig gerechnete Zeichnung eines Vorlagen-Schilds – alle Maße in mm. */
export interface VorlagenLayout {
  zeilen: string[];
  /** Schriftgröße des Haupttextes */
  groesse: number;
  /** Kleine Zeilen darunter, leer = keine */
  zusatzZeilen: string[];
  zusatzGroesse: number;
  /** Abstand zwischen Haupttext und kleinen Zeilen */
  zusatzAbstand: number;
  /** Innenabstand zum Schildrand (bei Rahmen ohne Rahmenstärke) */
  luft: number;
  /** Abstand der feinen Innenlinie vom Rand, 0 = keine */
  linieAbstand: number;
  /** Stärke der Innenlinie */
  linie: number;
  /** Rahmenstärke, nur bei `stil: "rahmen"` */
  rahmen: number;
  hintergrund: string;
  schrift: string;
  /** Linienfarbe */
  strich: string;
}

/**
 * Wie das Schild gesetzt wird.
 *
 * Gewählt wird zwischen einer und zwei Zeilen danach, was die größere Schrift
 * ergibt – „STARK REDUZIERT" in einer Zeile wäre auf 48,5 mm klein, in zwei
 * Zeilen füllt es das Schild. Ein von Hand gesetzter Umbruch gilt immer (bis zu drei Zeilen,
 * etwa „%" über und unter „REDUZIERT").
 *
 * Der Text bekommt rundum Luft zur Innenlinie bzw. zum Rahmen: der Rand ist
 * Teil des Entwurfs, nicht der Platz, der übrig bleibt.
 */
export function vorlagenLayout(v: Vorlage, format: SchildFormat): VorlagenLayout {
  const text = v.text.trim().toUpperCase();
  const zusatz = v.zusatz.trim();
  const flaeche = v.stil === "flaeche";

  const luft = klemme(format.hoehe * 0.07, 1.6, 5);
  const rahmen = flaeche ? 0 : klemme(format.hoehe * 0.035, 0.8, 2.4);
  const linieAbstand = flaeche ? luft * 0.6 : 0;
  // Abstand Schildkante → Text: Linie bzw. Rahmen plus Luft dahinter.
  const rand = flaeche ? luft * 1.7 : rahmen + luft * 1.1;

  const innenB = format.breite - 2 * rand;
  const innenH = format.hoehe - 2 * rand;

  // Kleine Zeile: eine Zielgröße, die lesbar ist, und lieber zwei Zeilen als
  // eine winzige. So bleibt „Nur solange der Vorrat reicht" über Armlänge lesbar.
  let zusatzZeilen: string[] = [];
  let zusatzGroesse = 0;
  if (zusatz) {
    const ziel = klemme(format.hoehe * 0.075, 2.4, 7);
    const einzeilig = [zusatz];
    const einzeiligGroesse = Math.min(ziel, innenB / breitesteEm(einzeilig, 0.03));
    const zweizeilig = besterUmbruch(zusatz, false);
    const zweizeiligGroesse = zweizeilig
      ? Math.min(ziel, innenB / breitesteEm(zweizeilig, 0.03))
      : 0;
    if (zweizeilig && einzeiligGroesse < ziel * 0.8 && zweizeiligGroesse > einzeiligGroesse) {
      zusatzZeilen = zweizeilig;
      zusatzGroesse = zweizeiligGroesse;
    } else {
      zusatzZeilen = einzeilig;
      zusatzGroesse = einzeiligGroesse;
    }
    zusatzGroesse = Math.max(1.5, zusatzGroesse);
  }
  const zusatzAbstand = zusatz ? zusatzGroesse * 0.9 : 0;
  const zusatzHoehe = zusatz
    ? zusatzZeilen.length * zusatzGroesse * 1.15 + zusatzAbstand
    : 0;

  const hoeheHaupt = Math.max(1, innenH - zusatzHoehe);

  const berechne = (zeilen: string[]) =>
    Math.min(
      innenB / breitesteEm(zeilen),
      hoeheHaupt / (zeilen.length * ZEILE),
      innenH * 0.5,
    );

  const manuell = text.includes("\n")
    ? text
        .split("\n")
        .map((z) => z.trim())
        .filter(Boolean)
        .slice(0, 3)
    : null;

  let zeilen: string[];
  if (manuell && manuell.length > 0) {
    zeilen = manuell;
  } else {
    const einzeilig = [text || " "];
    const zweizeilig = besterUmbruch(text);
    zeilen =
      zweizeilig && berechne(zweizeilig) > berechne(einzeilig) * 1.15
        ? zweizeilig
        : einzeilig;
  }

  const schrift = flaeche ? schriftAuf(v.farbe) : v.farbe;

  return {
    zeilen,
    groesse: klemme(berechne(zeilen), 1.5, 40),
    zusatzZeilen,
    zusatzGroesse,
    zusatzAbstand,
    luft: rand - rahmen,
    linieAbstand,
    linie: klemme(format.hoehe * 0.007, 0.15, 0.45),
    rahmen,
    hintergrund: flaeche ? v.farbe : "#fff",
    schrift,
    strich: schrift,
  };
}

/** Prüft eine Hex-Farbe der Form #rrggbb. */
export function istHexFarbe(wert: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(wert);
}
