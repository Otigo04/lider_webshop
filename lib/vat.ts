/**
 * Umsatzsteuer für die Anzeige.
 *
 * Der Shop führt Nettopreise – das ist im Großhandel richtig und steht so an
 * jedem Artikel. Zu überweisen ist aber der Bruttobetrag, und den muss der
 * Kunde sehen, bevor er bestellt. Diese Datei rechnet ihn aus; der Steuersatz
 * kommt aus `company_settings.pos_vat_rate` und wird an der Bestellung
 * festgeschrieben (`orders.vat_rate`, Migration 029).
 *
 * Gerundet wird auf den ganzen Cent und immer auf die Summe, nie auf die
 * einzelne Zeile: sonst weicht die Summe der gerundeten Zeilen von der
 * gerundeten Summe ab, und der Kunde überweist einen anderen Betrag, als auf
 * der Rechnung steht.
 */

export interface Steuerbetraege {
  /** Warenwert ohne Steuer */
  netto: number;
  /** Steuerbetrag auf den Warenwert */
  steuer: number;
  /** Zu zahlender Endbetrag */
  brutto: number;
  /** Angewandter Satz in Prozent */
  satz: number;
}

function aufCent(wert: number): number {
  return Math.round(wert * 100) / 100;
}

export function steuer(netto: number, satz: number): Steuerbetraege {
  const sauber = Number.isFinite(satz) && satz > 0 ? satz : 0;
  const steuerbetrag = aufCent((netto * sauber) / 100);
  return {
    netto: aufCent(netto),
    steuer: steuerbetrag,
    brutto: aufCent(netto) + steuerbetrag,
    satz: sauber,
  };
}

/** Nur der Endbetrag – für Stellen, an denen die Aufschlüsselung nicht passt. */
export function brutto(netto: number, satz: number): number {
  return steuer(netto, satz).brutto;
}
