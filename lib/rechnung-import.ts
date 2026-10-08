import { z } from "zod";
import type { PosProduct } from "@/lib/queries/pos";

/**
 * Rechnung hochladen – die reinen Funktionen.
 *
 * Die KI liest ab, sie rechnet nicht: Preise, Summen und Prüfungen entstehen
 * hier. Ohne Server- und Browser-Bezug, damit sich jede Regel mit `npm test`
 * prüfen lässt – es geht um Geld.
 *
 * Gerechnet wird in Cent (ganze Zahlen), wo verglichen wird: 117,66 und
 * 117,72 sind in Gleitkomma 6 Cent auseinander oder 6,0000000000001, und
 * die Toleranz soll nicht vom Zufall der Darstellung abhängen.
 */

export const positionSchema = z.object({
  /** GTIN der Zeile, leer erlaubt (Alpalium führt keine). */
  ean: z.string().nullable(),
  /** Artikelnummer des Lieferanten – nicht unsere. Nur zur Orientierung. */
  artikelnummer: z.string().nullable(),
  name: z.string(),
  menge: z.number(),
  /** Listenpreis je Stück, netto, vor Rabatt. Bei Iden die Spalte „VK-Preis“. */
  listenpreis: z.number(),
  /** Rabatt der Zeile in Prozent, 0 ohne Rabatt. */
  rabattProzent: z.number(),
  /** Unverbindliche Preisempfehlung, brutto; null, wenn die Rechnung keine führt. */
  uvp: z.number().nullable(),
  /** Zeilenbetrag netto laut Rechnung – dient nur der Gegenprobe. */
  zeilenbetrag: z.number(),
  /** Vorschlag aus der Warengruppenliste; null, wenn unsicher. */
  warengruppeId: z.string().nullable(),
});

export const rechnungSchema = z.object({
  lieferant: z.string(),
  rechnungsnummer: z.string(),
  /** TT.MM.JJJJ, null, wenn nicht lesbar. */
  datum: z.string().nullable(),
  /** „Gesamt ohne MwSt.“ laut Rechnung. */
  nettoGesamt: z.number(),
  /** Servicegebühr, Versand, Verpackung – netto, keine Artikel. */
  nebenkostenNetto: z.number(),
  positionen: z.array(positionSchema),
});

export type RechnungPosition = z.infer<typeof positionSchema>;
export type Rechnung = z.infer<typeof rechnungSchema>;

/** Antwort des Route Handlers an den Dialog. */
export interface RechnungAntwort {
  rechnung: Rechnung;
  /** Gefundene Artikel, Schlüssel = gelesene EAN. Was fehlt, wird neu angelegt. */
  produkte: Record<string, PosProduct>;
  /** created_at der Journalzeilen, wenn die Rechnungsnummer schon gebucht ist. */
  bereitsGebuchtAm: string | null;
  /** MwSt-Satz in Prozent aus company_settings.pos_vat_rate. */
  mwstSatz: number;
  /** Zuletzt benutzte Warengruppe – Vorgabe für Neuanlagen ohne Vorschlag. */
  vorgabeKategorieId: string | null;
}

/** Toleranz der Gegenproben, in Cent. */
export const TOLERANZ_CENT = 6;

const cent = (betrag: number) => Math.round(betrag * 100);
const runde2 = (betrag: number) => cent(betrag) / 100;

/**
 * Gelesene Rechnung säubern.
 *
 * EAN nur aus Ziffern und mindestens acht lang (kürzer ist keine GTIN),
 * Mengen ganzzahlig, Zeilen ohne Menge raus – ein gelesenes „0 Stück“ ist
 * ein Lesefehler oder eine Textzeile, keine Buchung.
 */
export function bereinige(r: Rechnung): Rechnung {
  return {
    ...r,
    lieferant: r.lieferant.trim(),
    rechnungsnummer: r.rechnungsnummer.trim(),
    positionen: r.positionen
      .map((p) => {
        const ziffern = (p.ean ?? "").replace(/\D/g, "");
        return {
          ...p,
          name: p.name.trim(),
          menge: Math.round(p.menge),
          ean: ziffern.length >= 8 ? ziffern : null,
        };
      })
      .filter((p) => p.menge > 0),
  };
}

/** Einkaufspreis je Stück: Listenpreis abzüglich Rabatt, auf den Cent. */
export function ekProStueck(p: RechnungPosition): number {
  return runde2(p.listenpreis * (1 - p.rabattProzent / 100));
}

/**
 * Zeilenbetrag, wie er laut Menge, Listenpreis und Rabatt sein müsste.
 * Nicht aus dem gerundeten Stückpreis: 120 × 0,98 wären 117,60, die Rechnung
 * sagt 117,72, weil sie erst am Ende rundet.
 */
export function erwarteterBetrag(p: RechnungPosition): number {
  return runde2(p.menge * p.listenpreis * (1 - p.rabattProzent / 100));
}

export function zeileStimmt(p: RechnungPosition): boolean {
  return Math.abs(cent(erwarteterBetrag(p)) - cent(p.zeilenbetrag)) <= TOLERANZ_CENT;
}

/** Summe der Zeilen gegen „Gesamt ohne MwSt.“ abzüglich Nebenkosten. */
export function pruefeSumme(
  r: Pick<Rechnung, "positionen" | "nettoGesamt" | "nebenkostenNetto">,
): { summe: number; erwartet: number; ok: boolean } {
  const summe = r.positionen.reduce((s, p) => s + cent(p.zeilenbetrag), 0);
  const erwartet = cent(r.nettoGesamt) - cent(r.nebenkostenNetto);
  return {
    summe: summe / 100,
    erwartet: erwartet / 100,
    ok: Math.abs(summe - erwartet) <= TOLERANZ_CENT,
  };
}

/**
 * Großhandelspreis ohne UVP: EK × 1,30, aufgerundet auf 10 Cent.
 * Ganzzahlig gerechnet (× 13 ÷ 10): 100 × 1,3 ergibt in Gleitkomma
 * 130,00000000000001, und aufgerundet stünde 1,40 statt 1,30 am Regal.
 */
export function grosshandelAusEk(ek: number): number {
  const mindest = Math.ceil((cent(ek) * 13) / 10);
  return (Math.ceil(mindest / 10) * 10) / 100;
}

/** Ladenpreis ohne UVP: EK × 2, aufgerundet auf die nächste X,99 €. */
export function ehAusEk(ek: number): number {
  const mindest = cent(ek) * 2;
  const basis99 = Math.floor(mindest / 100) * 100 + 99;
  return (basis99 >= mindest ? basis99 : basis99 + 100) / 100;
}

/**
 * Preise eines neuen Artikels.
 *
 * Mit UVP (Iden): Laden = UVP, Großhandel = UVP netto. Ohne (Alpalium):
 * Aufschläge auf den Einkaufspreis. Aufgerundet, nie abgerundet – ein Preis
 * unter dem Einkauf darf nicht entstehen.
 */
export function preiseNeuerArtikel(
  p: RechnungPosition,
  mwstSatz: number,
): { ek: number; gh: number; eh: number } {
  const ek = ekProStueck(p);
  if (p.uvp !== null && p.uvp > 0) {
    return { ek, gh: runde2(p.uvp / (1 + mwstSatz / 100)), eh: runde2(p.uvp) };
  }
  return { ek, gh: grosshandelAusEk(ek), eh: ehAusEk(ek) };
}

/**
 * Gleicher Barcode zweimal heißt eine Zeile mit summierter Menge – wie im
 * Sammelimport. Zeilen ohne Barcode bleiben getrennt, auch wenn sie gleich
 * heißen.
 */
export function fasseZusammen(positionen: RechnungPosition[]): RechnungPosition[] {
  const ergebnis: RechnungPosition[] = [];
  const nachCode = new Map<string, number>();

  for (const p of positionen) {
    const index = p.ean ? nachCode.get(p.ean) : undefined;
    if (index === undefined) {
      if (p.ean) nachCode.set(p.ean, ergebnis.length);
      ergebnis.push({ ...p });
      continue;
    }
    const vorhanden = ergebnis[index];
    ergebnis[index] = {
      ...vorhanden,
      menge: vorhanden.menge + p.menge,
      zeilenbetrag: runde2(vorhanden.zeilenbetrag + p.zeilenbetrag),
    };
  }
  return ergebnis;
}
