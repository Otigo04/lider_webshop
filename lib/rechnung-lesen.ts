import { getDocumentProxy } from "unpdf";
import { leseIdenZeilen } from "@/lib/rechnung-iden";
import { bereinige, type Rechnung } from "@/lib/rechnung-import";

/**
 * Rechnung aus dem PDF lesen – ohne KI, ohne Kosten.
 *
 * Eigene Datei ohne `server-only`: das Prüfskript
 * `scripts/rechnung-lesen-check.mjs` ruft dieselbe Funktion wie der Route
 * Handler, damit ein echtes PDF ohne Browser und Anmeldung geprüft werden kann.
 *
 * Aus den Textstücken des PDFs werden Zeilen gebaut (gleiche Höhe = gleiche
 * Zeile, von links nach rechts), die der Leser des Lieferanten dann zerlegt.
 * Bisher gibt es einen Leser: `lib/rechnung-iden.ts`. Ein weiterer Lieferant
 * heißt ein weiterer Leser und ein weiterer Aufruf in `leseRechnung()`.
 */

/** Textstücke gleicher Höhe (±3 pt) bilden eine Zeile. */
const ZEILENTOLERANZ = 3;

async function zeilenAusPdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const zeilen: string[] = [];

  for (let nr = 1; nr <= pdf.numPages; nr++) {
    const inhalt = await (await pdf.getPage(nr)).getTextContent();
    const stuecke = inhalt.items
      .flatMap((item) =>
        "str" in item && item.str.trim()
          ? [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }]
          : [],
      )
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const seite: { y: number; teile: { text: string; x: number }[] }[] = [];
    for (const s of stuecke) {
      const letzte = seite[seite.length - 1];
      if (letzte && Math.abs(letzte.y - s.y) <= ZEILENTOLERANZ) {
        letzte.teile.push(s);
      } else {
        seite.push({ y: s.y, teile: [s] });
      }
    }
    for (const z of seite) {
      zeilen.push(
        z.teile
          .sort((a, b) => a.x - b.x)
          .map((t) => t.text)
          .join(" "),
      );
    }
  }
  return zeilen;
}

export async function leseRechnung(bytes: Uint8Array): Promise<Rechnung> {
  return bereinige(leseIdenZeilen(await zeilenAusPdf(bytes)));
}
