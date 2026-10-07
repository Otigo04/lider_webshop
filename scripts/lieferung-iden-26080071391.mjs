/**
 * Lieferung Iden, Rechnung 26080071391 vom 06.10.2026 (Abholung, Kreditkarte).
 *
 * Aus dem PDF der Rechnung übernommen. Spalten wie in
 * lieferung-iden-26080067333.mjs:
 *   ean    – zweite Nummer der Zeile (EAN/GTIN), nicht die Iden-Artikelnummer
 *   name   – gekürzte Bezeichnung fürs Regal
 *   menge  – Stück
 *   uvp    – unverbindliche Preisempfehlung, brutto (Ladenpreis)
 *   vk     – "VK-Preis" der Rechnung: Listenpreis des Lieferanten, netto
 *   rabatt – Einkaufsrabatt dieser Zeile (0 oder 0.1)
 *   betrag – Zeilenbetrag laut Rechnung, netto – dient nur der Gegenprobe
 *   gruppe – Warengruppe
 */

export { preise } from "./lieferung-iden-26080067333.mjs";

const SQ = "Dumpling's & Squishy's";

export const POSITIONEN = [
  { ean: "0196214147249", name: "Pokémon Sammelkarten Poster-Kollektion 30 Jahre", menge: 4, uvp: 23.99, vk: 14.19, rabatt: 0, betrag: 56.76, gruppe: "Spielwaren" },
  { ean: "0196214144989", name: "Pokémon Sammelkarten Tech-Sticker-Kollektion 30 Jahre", menge: 6, uvp: 19.99, vk: 12.01, rabatt: 0, betrag: 72.06, gruppe: "Spielwaren" },
  { ean: "4018587764464", name: "Antistress Quetsch Katze 12 cm, sortiert", menge: 2, uvp: 3.49, vk: 2.19, rabatt: 0.1, betrag: 3.94, gruppe: SQ },
  { ean: "4006592097394", name: "Antistressball Gootastic Ice Cute Würfelform 5 cm, 2fach sortiert", menge: 1, uvp: 4.99, vk: 2.8, rabatt: 0.1, betrag: 2.52, gruppe: SQ },
  { ean: "4260612167805", name: "Antistress Stretchy Glitzer Hochlandrind, 6fach sortiert", menge: 1, uvp: 5.29, vk: 2.59, rabatt: 0.1, betrag: 2.33, gruppe: SQ },
  { ean: "4260612168154", name: "Stretchy Glitzer Ball, 6fach sortiert", menge: 1, uvp: 2.99, vk: 1.49, rabatt: 0.1, betrag: 1.34, gruppe: SQ },
  { ean: "4032722968913", name: "Squeeze Schneemann Glitzer", menge: 60, uvp: 4.99, vk: 2.54, rabatt: 0.1, betrag: 137.16, gruppe: SQ },
  { ean: "4032722968944", name: "Glitter-Squeeze-Ball Make a Wish", menge: 24, uvp: 4.99, vk: 2.54, rabatt: 0.1, betrag: 54.86, gruppe: SQ },
  { ean: "3588270021972", name: "Pufferball 10 cm, 4fach sortiert", menge: 36, uvp: 2.99, vk: 1.49, rabatt: 0.1, betrag: 48.28, gruppe: SQ },
  { ean: "8711866245048", name: "Slime Glitter Galaxy", menge: 6, uvp: 4.99, vk: 2.29, rabatt: 0.1, betrag: 12.37, gruppe: SQ },
  { ean: "4260612167645", name: "Antistress Stretchy Glitzer Meerestiere, sortiert", menge: 60, uvp: 3.59, vk: 1.79, rabatt: 0.1, betrag: 96.65, gruppe: SQ },
  { ean: "5413247092656", name: "Antistress Squeeze Octopus, 4fach sortiert", menge: 91, uvp: 3.29, vk: 1.59, rabatt: 0.1, betrag: 130.22, gruppe: SQ },
  { ean: "5413247093509", name: "Squeeze Gamepad, 4fach sortiert", menge: 48, uvp: 2.49, vk: 1.25, rabatt: 0.1, betrag: 54.0, gruppe: SQ },
  { ean: "8713219602140", name: "Squishy Jumbo Kuchenstück XXL 12x12 cm", menge: 11, uvp: 5.99, vk: 3.49, rabatt: 0.1, betrag: 34.55, gruppe: SQ },
  { ean: "4032722965691", name: "Knautschfigur Magic Moments Snow Friends Schneemann Splashy Sparkle, 3fach sortiert", menge: 35, uvp: 4.99, vk: 2.54, rabatt: 0.1, betrag: 80.01, gruppe: SQ },
  { ean: "4018587461080", name: "Squishy Axolotl Stretch-O Maltose 10,5x5,5x6 cm, 4fach sortiert", menge: 67, uvp: 3.39, vk: 1.19, rabatt: 0.1, betrag: 71.76, gruppe: SQ },
  { ean: "4018587461134", name: "Squishy Dumplings 9 cm, 8fach sortiert", menge: 12, uvp: 7.99, vk: 2.99, rabatt: 0.1, betrag: 32.29, gruppe: SQ },
];

/** Gesamt EUR ohne MwSt. laut Rechnung. */
export const NETTO = 891.1;
