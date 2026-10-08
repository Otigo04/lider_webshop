/**
 * Lieferung Iden, Rechnung 26040197140 vom 06.10.2026 (Webshop, Bankeinzug).
 *
 * Aus dem PDF der Rechnung übernommen. Spalten wie in
 * lieferung-iden-26080067333.mjs:
 *   ean    – zweite Nummer der Zeile (EAN/GTIN), nicht die Iden-Artikelnummer
 *   name   – gekürzte Bezeichnung fürs Regal
 *   menge  – Stück
 *   uvp    – unverbindliche Preisempfehlung, brutto (Ladenpreis)
 *   vk     – "VK-Preis" der Rechnung: Listenpreis des Lieferanten, netto
 *   rabatt – Einkaufsrabatt dieser Zeile
 *   betrag – Zeilenbetrag laut Rechnung, netto – dient nur der Gegenprobe
 *   gruppe – Warengruppe
 *
 * Nicht enthalten: die Servicegebühr 3,95 €.
 */

export { preise } from "./lieferung-iden-26080067333.mjs";

const SQ = "Dumpling's & Squishy's";

export const POSITIONEN = [
  { ean: "4018587753000", name: "Flutschi Ball 7 cm, 6fach sortiert", menge: 120, uvp: 2.49, vk: 1.09, rabatt: 0.1, betrag: 117.72, gruppe: SQ },
  { ean: "3588270022054", name: "Flutschi Water Wigglers Fisch blau 12 cm", menge: 43, uvp: 2.99, vk: 1.29, rabatt: 0.1, betrag: 49.92, gruppe: SQ },
  { ean: "3588270013847", name: "Slime Oktopus, 4fach sortiert", menge: 120, uvp: 2.49, vk: 1.19, rabatt: 0.1, betrag: 128.52, gruppe: SQ },
];

/** Gesamt EUR ohne MwSt. laut Rechnung, ohne Servicegebühr 3,95 €. */
export const NETTO = 300.11 - 3.95;
