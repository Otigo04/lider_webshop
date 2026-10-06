/**
 * Kundenrabatt (Sonderkondition) und Gutscheine – Rechnung für die Anzeige.
 *
 * Verbindlich rechnet `create_order()` in der Datenbank
 * (supabase/migrations/054_kundenrabatt_und_gutscheine.sql). Diese Datei
 * bildet dieselbe Reihenfolge und Rundung nach, damit Warenkorb und
 * Bestellformular den Betrag zeigen, der hinterher auf der Rechnung steht.
 * Wer hier etwas ändert, ändert die SQL-Funktion und tests/rabatt.test.ts mit.
 *
 * Reihenfolge:
 *   1. Warenwert = Summe der Positionen (Staffelpreise)
 *   2. Sonderkondition des Kunden in Prozent auf den Warenwert
 *   3. Gutschein auf den Rest – Prozent oder fester Betrag, höchstens der Rest
 *   4. Was übrig bleibt, ist der Nettobetrag der Bestellung (`total_amount`);
 *      darauf rechnet `lib/vat.ts` die Steuer, wie bisher.
 *
 * Der Mindestbestellwert eines Gutscheins gilt gegen den Warenwert vor allen
 * Rabatten – das ist die Zahl, die der Kunde im Warenkorb sieht und mit der
 * Angabe auf dem Gutschein vergleicht.
 */

export type GutscheinArt = "percent" | "fixed";

/** Was der Browser über einen eingelösten Gutschein weiß. */
export interface GutscheinKern {
  code: string;
  kind: GutscheinArt;
  value: number;
  min_order_amount: number;
}

export interface Rabattrechnung {
  /** Summe der Positionen vor Rabatten */
  warenwert: number;
  /** Angewandter Satz der Sonderkondition (0, wenn keine) */
  kundenSatz: number;
  kundenRabatt: number;
  /** Gutscheinabzug, 0 ohne Gutschein oder bei verfehltem Mindestwert */
  gutscheinRabatt: number;
  /** true, wenn ein Gutschein angegeben, der Mindestwert aber nicht erreicht ist */
  mindestwertFehlt: boolean;
  /** Nettobetrag nach allen Rabatten */
  netto: number;
}

function aufCent(wert: number): number {
  return Math.round(wert * 100) / 100;
}

function zahl(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? n : 0;
}

/** Satz auf [0, 100) geklemmt – 100 % hieße „verschenkt", das ist kein Rabatt. */
export function kundenSatz(wert: unknown): number {
  const n = zahl(wert);
  if (n <= 0) return 0;
  return Math.min(n, 99.99);
}

export function rabatte(
  warenwert: number,
  satz: number,
  gutschein?: GutscheinKern | null,
): Rabattrechnung {
  const wert = aufCent(Math.max(zahl(warenwert), 0));
  const s = kundenSatz(satz);
  const kundenRabatt = aufCent((wert * s) / 100);
  const basis = aufCent(wert - kundenRabatt);

  let gutscheinRabatt = 0;
  let mindestwertFehlt = false;

  if (gutschein) {
    if (wert < zahl(gutschein.min_order_amount)) {
      mindestwertFehlt = true;
    } else if (gutschein.kind === "percent") {
      const p = Math.min(Math.max(zahl(gutschein.value), 0), 100);
      gutscheinRabatt = aufCent((basis * p) / 100);
    } else {
      gutscheinRabatt = aufCent(Math.min(Math.max(zahl(gutschein.value), 0), basis));
    }
  }

  return {
    warenwert: wert,
    kundenSatz: s,
    kundenRabatt,
    gutscheinRabatt,
    mindestwertFehlt,
    netto: aufCent(basis - gutscheinRabatt),
  };
}

/** „10 %" oder „15,00 €" – die Angabe auf dem Gutschein selbst. */
export function gutscheinWert(kind: GutscheinArt, value: number): string {
  if (kind === "percent") {
    return `${zahl(value).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
  }
  return zahl(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/** „10 %" für die Sonderkondition, ohne überflüssige Nachkommastellen. */
export function satzText(satz: number): string {
  return `${zahl(satz).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}

/**
 * Gutscheincode normalisieren: Großbuchstaben, ohne Leerzeichen. Der Kunde
 * tippt „sommer 25", gespeichert ist „SOMMER25" – ein Code soll nicht an der
 * Schreibweise scheitern.
 */
export function normalisiereCode(eingabe: string): string {
  return eingabe.toUpperCase().replace(/\s+/g, "");
}

/** Erlaubte Form, identisch zum CHECK der Tabelle `vouchers`. */
export const CODE_MUSTER = /^[A-Z0-9-]{3,32}$/;

/**
 * Zufälliger Code ohne verwechselbare Zeichen (0/O, 1/I/L). Wird am Telefon
 * vorgelesen und von Hand abgetippt.
 */
export function zufallsCode(laenge = 8): string {
  const zeichen = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const zufall = new Uint32Array(laenge);
  crypto.getRandomValues(zufall);
  return Array.from(zufall, (n) => zeichen[n % zeichen.length]).join("");
}

/** Rabattfelder einer gespeicherten Bestellung (Migration 054). */
export interface BestellRabatte {
  total_amount: number;
  subtotal_amount?: number | null;
  customer_discount_percent?: number | null;
  customer_discount_amount?: number | null;
  voucher_code?: string | null;
  voucher_discount_amount?: number | null;
}

export interface Abzugszeile {
  label: string;
  /** negativ – so steht er auch auf der Rechnung */
  betrag: number;
}

/**
 * Abzüge einer Bestellung als Zeilen für Rechnung, Mail und Bestellseite.
 * Leer, wenn es keine gab – dann sieht alles aus wie vor Migration 054.
 */
export function abzugszeilen(order: BestellRabatte): Abzugszeile[] {
  const zeilen: Abzugszeile[] = [];
  const kunde = zahl(order.customer_discount_amount);
  if (kunde > 0) {
    zeilen.push({
      label: `Sonderkondition ${satzText(zahl(order.customer_discount_percent))}`,
      betrag: -kunde,
    });
  }
  const gutschein = zahl(order.voucher_discount_amount);
  if (gutschein > 0) {
    zeilen.push({
      label: `Gutschein ${order.voucher_code ?? ""}`.trim(),
      betrag: -gutschein,
    });
  }
  return zeilen;
}

/** Warenwert vor Rabatten; bei Altbestand der Nettobetrag selbst. */
export function warenwertVon(order: BestellRabatte): number {
  return order.subtotal_amount == null
    ? zahl(order.total_amount)
    : zahl(order.subtotal_amount);
}

export interface KassenSummen {
  /** Summe aller Positionen vor der Kondition, in der Preislesart des Bons */
  summe: number;
  /** Abzug der Sonderkondition auf die Katalogartikel */
  abzug: number;
  netto: number;
  ust: number;
  brutto: number;
}

/**
 * Summen an der Kasse – dieselbe Rechnung wie create_pos_sale()
 * (Migration 056): jede Zeile auf den Cent, Kondition nur auf
 * Katalogartikel (freie Positionen bleiben unberührt), danach die Steuer.
 * Bei Bruttopreisen wird sie herausgerechnet, sonst aufgeschlagen.
 */
export function kassenSummen(
  zeilen: { unitPrice: number; quantity: number; katalog: boolean }[],
  satz: number,
  brutto: boolean,
  ustSatz: number,
): KassenSummen {
  let summe = 0;
  let artikel = 0;
  for (const z of zeilen) {
    const sub = aufCent(zahl(z.unitPrice) * zahl(z.quantity));
    summe = aufCent(summe + sub);
    if (z.katalog) artikel = aufCent(artikel + sub);
  }
  const abzug = aufCent((artikel * kundenSatz(satz)) / 100);
  const basis = aufCent(summe - abzug);
  if (brutto) {
    const netto = aufCent(basis / (1 + ustSatz / 100));
    return { summe, abzug, netto, ust: aufCent(basis - netto), brutto: basis };
  }
  const ust = aufCent((basis * ustSatz) / 100);
  return { summe, abzug, netto: basis, ust, brutto: aufCent(basis + ust) };
}
