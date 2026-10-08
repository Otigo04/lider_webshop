import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { summen, type BestandZeile } from "@/lib/bestand-export";

/**
 * Bestandsliste als PDF, A4 quer.
 *
 * Tabelle von Hand gesetzt: die Spaltenbreiten stehen fest, lange Bezeichnungen
 * werden mit „...“ gekürzt statt umgebrochen – eine Zeile je Artikel, damit
 * eine Seite 40 Artikel trägt. Die Kopfzeile wiederholt sich auf jeder Seite,
 * die Summe steht unter der letzten Zeile, „Seite x von y“ unten.
 *
 * Standardschrift (Helvetica, WinAnsi): kein Font im Paket. Zeichen, die sie
 * nicht kennt (kyrillisch, Sonderzeichen aus Lieferantennamen), werden zu „?“
 * statt den ganzen Export abzubrechen.
 */

const SEITE: [number, number] = [841.89, 595.28];
const RAND = 28;
const ZEILE = 13;
const KOPF = 16;
const FUSS = 24;
const SCHRIFT = 8;
const POLSTER = 3;

const euro = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const stueck = new Intl.NumberFormat("de-DE");

interface Spalte {
  titel: string;
  breite: number;
  rechts?: boolean;
  wert: (z: BestandZeile) => string;
}

function spalten(mitEk: boolean): Spalte[] {
  const preis = (n: number | null) => (n === null ? "" : euro.format(n));
  const fest: Spalte[] = [
    { titel: "Artikelnr.", breite: 58, wert: (z) => z.sku },
    { titel: "Barcode", breite: 80, wert: (z) => z.barcode ?? "" },
    { titel: "Bezeichnung", breite: 0, wert: (z) => z.name },
    { titel: "Warengruppe", breite: 110, wert: (z) => z.kategorie },
    { titel: "Bestand", breite: 44, rechts: true, wert: (z) => stueck.format(z.bestand) },
    { titel: "Laden €", breite: 52, rechts: true, wert: (z) => preis(z.laden) },
    { titel: "Großhandel €", breite: 62, rechts: true, wert: (z) => preis(z.grosshandel) },
  ];
  if (mitEk) {
    fest.push(
      { titel: "Einkauf €", breite: 52, rechts: true, wert: (z) => preis(z.einkauf) },
      { titel: "Warenwert EK €", breite: 70, rechts: true, wert: (z) => preis(z.warenwert) },
    );
  }
  // Die Bezeichnung bekommt den Rest der Breite.
  const nutzbar = SEITE[0] - 2 * RAND;
  const belegt = fest.reduce((s, c) => s + c.breite, 0);
  fest[2].breite = nutzbar - belegt;
  return fest;
}

/** Nur Zeichen, die die Schrift kennt; Zeilenumbrüche und Tabs werden Leerzeichen. */
function sauber(text: string, font: PDFFont): string {
  const erlaubt = new Set(font.getCharacterSet());
  let aus = "";
  for (const zeichen of text.replace(/\s+/g, " ")) {
    aus += erlaubt.has(zeichen.codePointAt(0) as number) ? zeichen : "?";
  }
  return aus;
}

/** Auf die Spaltenbreite kürzen, mit „...“. */
function passe(text: string, font: PDFFont, groesse: number, breite: number): string {
  const t = sauber(text, font);
  if (font.widthOfTextAtSize(t, groesse) <= breite) return t;
  let kurz = t;
  while (kurz.length > 0 && font.widthOfTextAtSize(`${kurz}...`, groesse) > breite) {
    kurz = kurz.slice(0, -1);
  }
  return `${kurz.trimEnd()}...`;
}

export async function baueBestandPdf(
  zeilen: BestandZeile[],
  mitEk: boolean,
  stand: Date,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Bestandsliste");
  doc.setCreator("LIDER");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);

  const cols = spalten(mitEk);
  const s = summen(zeilen);
  const standText = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(stand);

  const seiten: PDFPage[] = [];
  let seite!: PDFPage;
  let y = 0;

  function text(
    t: string,
    x: number,
    baseline: number,
    schrift: PDFFont = font,
    groesse = SCHRIFT,
  ) {
    seite.drawText(sauber(t, schrift), {
      x,
      y: baseline,
      size: groesse,
      font: schrift,
      color: rgb(0.07, 0.09, 0.15),
    });
  }

  function zelle(c: Spalte, x: number, wert: string, baseline: number, schrift: PDFFont) {
    const t = passe(wert, schrift, SCHRIFT, c.breite - 2 * POLSTER);
    const breite = schrift.widthOfTextAtSize(t, SCHRIFT);
    text(t, c.rechts ? x + c.breite - POLSTER - breite : x + POLSTER, baseline, schrift);
  }

  function kopfzeile() {
    seite.drawRectangle({
      x: RAND,
      y: y - KOPF,
      width: SEITE[0] - 2 * RAND,
      height: KOPF,
      color: rgb(0.9, 0.91, 0.92),
    });
    let x = RAND;
    for (const c of cols) {
      zelle(c, x, c.titel, y - KOPF + 5, fett);
      x += c.breite;
    }
    y -= KOPF;
  }

  function neueSeite(erste: boolean) {
    seite = doc.addPage(SEITE);
    seiten.push(seite);
    y = SEITE[1] - RAND;
    if (erste) {
      text("Bestandsliste", RAND, y - 12, fett, 14);
      const teile = [
        `Stand ${standText}`,
        `${stueck.format(s.positionen)} Artikel`,
        `${stueck.format(s.stueck)} Stück`,
      ];
      if (mitEk && s.warenwertEk !== null) {
        teile.push(`Warenwert zum Einkauf ${euro.format(s.warenwertEk)} €`);
      }
      text(teile.join("  ·  "), RAND, y - 26, font, SCHRIFT);
      y -= 38;
    }
    kopfzeile();
  }

  neueSeite(true);

  for (const z of zeilen) {
    if (y - ZEILE < RAND + FUSS) neueSeite(false);
    let x = RAND;
    for (const c of cols) {
      zelle(c, x, c.wert(z), y - ZEILE + 4, font);
      x += c.breite;
    }
    seite.drawLine({
      start: { x: RAND, y: y - ZEILE },
      end: { x: SEITE[0] - RAND, y: y - ZEILE },
      thickness: 0.4,
      color: rgb(0.88, 0.89, 0.9),
    });
    y -= ZEILE;
  }

  // Summenzeile
  if (y - ZEILE - 4 < RAND + FUSS) neueSeite(false);
  y -= 4;
  seite.drawLine({
    start: { x: RAND, y },
    end: { x: SEITE[0] - RAND, y },
    thickness: 0.8,
    color: rgb(0.07, 0.09, 0.15),
  });
  let x = RAND;
  for (const c of cols) {
    let wert = "";
    if (c.titel === "Bezeichnung") wert = `Summe (${stueck.format(s.positionen)} Artikel)`;
    if (c.titel === "Bestand") wert = stueck.format(s.stueck);
    if (c.titel === "Warenwert EK €" && s.warenwertEk !== null) {
      wert = euro.format(s.warenwertEk);
    }
    if (wert) zelle(c, x, wert, y - ZEILE + 4, fett);
    x += c.breite;
  }

  // Fußzeile erst jetzt: erst jetzt steht die Seitenzahl fest.
  seiten.forEach((p, i) => {
    seite = p;
    text("LIDER · Bestandsliste", RAND, 16, font, 7);
    const rechts = `Seite ${i + 1} von ${seiten.length}`;
    text(rechts, SEITE[0] - RAND - font.widthOfTextAtSize(rechts, 7), 16, font, 7);
  });

  return Buffer.from(await doc.save());
}
