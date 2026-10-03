/**
 * Sammelimport für den Wareneingang – Liste einlesen statt Zeile für Zeile.
 *
 * Das Scannerfeld ist der schnellste Weg, wenn die Ware vor einem steht. Kommt
 * die Lieferung aber mit einer Rechnung oder Preisliste, steht alles schon
 * geschrieben da: Barcode, Bezeichnung, Menge, Preise. Diese Angaben noch
 * einmal von Hand in sechs Felder je Artikel zu tippen, ist bei hundert
 * Positionen eine halbe Arbeitsschicht – und jede getippte Ziffer ist eine
 * Gelegenheit für einen Zahlendreher.
 *
 * Deshalb: einfügen, prüfen, übernehmen. Gebucht wird danach wie immer über
 * dieselbe Liste und dieselbe Sammelbuchung (`record_stock_entries`). Der
 * Import schreibt nichts – er füllt nur die Aufnahme. Ein zweiter Buchungsweg
 * liefe über kurz oder lang neben dem ersten her.
 *
 * Reine Funktionen ohne Server- oder Browser-Bezug: dieselbe Zerlegung soll
 * sich prüfen lassen, ohne eine Datenbank oder ein Eingabefeld zu brauchen.
 */

/** Spalten in fester Reihenfolge – was die Kopfzeile auch behauptet. */
export const IMPORT_SPALTEN = [
  "Barcode",
  "Bezeichnung",
  "Menge",
  "GH €",
  "EH €",
  "EK €",
] as const;

export interface ImportZeile {
  /** Zeilennummer der Eingabe, für die Fehlermeldung */
  nr: number;
  barcode: string | null;
  name: string;
  menge: number;
  /** Leer heißt „unverändert", wie überall im Wareneingang – nie „0 €" */
  ghPreis: string;
  ehPreis: string;
  ekPreis: string;
}

export interface ImportErgebnis {
  zeilen: ImportZeile[];
  /** Zeilen, die nicht zu lesen waren – mit Grund und Urtext */
  fehler: { nr: number; text: string; grund: string }[];
}

/**
 * Trennzeichen der eingefügten Liste.
 *
 * Aus einer Tabellenkalkulation kommt beim Kopieren ein Tabulator, aus einer
 * CSV-Datei ein Semikolon. Das Komma ist bewusst **kein** Trennzeichen: im
 * deutschen Zahlenformat steht es im Preis, und aus „9,99" würden sonst zwei
 * Spalten.
 */
function spalten(zeile: string): string[] {
  const trenner = zeile.includes("\t") ? "\t" : ";";
  return zeile.split(trenner).map((feld) => feld.trim());
}

/** Kopfzeile erkennen, damit eine mitkopierte Überschrift keine Ware wird. */
function istKopfzeile(felder: string[]): boolean {
  const erste = felder[0]?.toLowerCase() ?? "";
  return (
    erste === "barcode" ||
    erste === "ean" ||
    erste === "gtin" ||
    erste === "art.nr." ||
    erste === "artikelnummer"
  );
}

/**
 * Preisfeld normalisieren: deutsches Komma zu Punkt, Währungszeichen weg.
 *
 * Gibt den **Text** zurück und keine Zahl, weil leer hier etwas bedeutet.
 * `""` heißt „diesen Preis nicht anfassen"; eine 0 wäre eine Aussage über den
 * Preis, und 0,00 € Einkauf gibt es nicht.
 */
function preis(feld: string | undefined): string {
  const roh = (feld ?? "").replace(/[€\s]/g, "").trim();
  if (!roh) return "";
  // Tausenderpunkt vor dem Dezimalkomma: „1.299,00" ist ein Preis, kein Pfad.
  const ohneTausender = /,\d{1,2}$/.test(roh) ? roh.replace(/\./g, "") : roh;
  return ohneTausender.replace(",", ".");
}

/** Ist das ein lesbarer Preis? Leer ist erlaubt, Buchstaben nicht. */
function preisGueltig(wert: string): boolean {
  if (wert === "") return true;
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl >= 0;
}

/**
 * Eingefügten Text in Aufnahmezeilen zerlegen.
 *
 * Erwartet wird je Zeile: Barcode; Bezeichnung; Menge; GH; EH; EK. Nur die
 * Menge ist Pflicht – ohne sie ist die Zeile keine Buchung. Barcode oder
 * Bezeichnung darf fehlen, aber nicht beides: sonst steht da eine Menge ohne
 * Ware.
 *
 * Fehlerhafte Zeilen werden **nicht** stillschweigend übergangen, sondern
 * gesammelt zurückgegeben. Eine Lieferung, bei der drei von hundert Positionen
 * lautlos fehlen, fällt erst beim Zählen im Regal auf.
 */
export function parseImport(text: string): ImportErgebnis {
  const zeilen: ImportZeile[] = [];
  const fehler: ImportErgebnis["fehler"] = [];

  text.split(/\r?\n/).forEach((roh, index) => {
    const nr = index + 1;
    if (!roh.trim()) return;

    /*
     * Die Zeile wird **nicht** als Ganzes getrimmt, nur die einzelnen Felder.
     * Ein führender Tabulator ist eine leere erste Spalte – genau das, was aus
     * einer Tabellenkalkulation kommt, wenn die Ware noch keinen Barcode hat.
     * Weggetrimmt rutschte die Bezeichnung in die Barcode-Spalte, und aus
     * einem Namen würde ein Code.
     */
    const felder = spalten(roh.replace(/\s+$/, ""));
    const text = roh.trim();
    if (istKopfzeile(felder)) return;

    const barcode = (felder[0] ?? "").replace(/\s/g, "") || null;
    const name = (felder[1] ?? "").trim().slice(0, 200);
    const mengeRoh = (felder[2] ?? "").trim();

    if (!barcode && !name) {
      fehler.push({ nr, text, grund: "Weder Barcode noch Bezeichnung" });
      return;
    }

    const menge = Number(mengeRoh.replace(",", "."));
    if (!mengeRoh || !Number.isFinite(menge) || !Number.isInteger(menge) || menge === 0) {
      fehler.push({ nr, text, grund: "Menge fehlt oder ist keine ganze Zahl" });
      return;
    }

    const ghPreis = preis(felder[3]);
    const ehPreis = preis(felder[4]);
    const ekPreis = preis(felder[5]);

    const kaputt = [
      [ghPreis, "Großhandelspreis"],
      [ehPreis, "Ladenpreis"],
      [ekPreis, "Einkaufspreis"],
    ].find(([wert]) => !preisGueltig(wert));

    if (kaputt) {
      fehler.push({ nr, text, grund: `${kaputt[1]} ist keine Zahl` });
      return;
    }

    zeilen.push({ nr, barcode, name, menge, ghPreis, ehPreis, ekPreis });
  });

  return { zeilen, fehler };
}

/**
 * Zeilen mit demselben Barcode zusammenlegen.
 *
 * Dieselbe Regel wie beim Scannen: zweimal derselbe Code heißt „zwei Stück",
 * nicht „zwei Zeilen". Zwei Zeilen für denselben Artikel ließen sich getrennt
 * bepreisen, und welcher Preis am Ende am Artikel steht, hinge an der
 * Reihenfolge. Zusammengelegt wird nur über den Barcode – zwei Zeilen ohne
 * Code sind zwei Posten, auch wenn sie gleich heißen.
 *
 * Preise der späteren Zeile gewinnen, sofern sie gesetzt sind: wer eine
 * Position korrigiert, hängt sie üblicherweise hinten an.
 */
export function fasseZusammen(zeilen: ImportZeile[]): ImportZeile[] {
  const ergebnis: ImportZeile[] = [];
  const nachBarcode = new Map<string, ImportZeile>();

  for (const zeile of zeilen) {
    if (!zeile.barcode) {
      ergebnis.push(zeile);
      continue;
    }
    const vorhanden = nachBarcode.get(zeile.barcode);
    if (!vorhanden) {
      const kopie = { ...zeile };
      nachBarcode.set(zeile.barcode, kopie);
      ergebnis.push(kopie);
      continue;
    }
    vorhanden.menge += zeile.menge;
    if (zeile.ghPreis) vorhanden.ghPreis = zeile.ghPreis;
    if (zeile.ehPreis) vorhanden.ehPreis = zeile.ehPreis;
    if (zeile.ekPreis) vorhanden.ekPreis = zeile.ekPreis;
    if (zeile.name && !vorhanden.name) vorhanden.name = zeile.name;
  }

  return ergebnis;
}
