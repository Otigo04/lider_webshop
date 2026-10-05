/**
 * Lieferungen Iden, Rechnungen 26080067333 (Spielwaren, Kerzen) und
 * 26080067334 (Idena LED-Beleuchtung), beide vom 22.09.2026.
 *
 * Abgetippt aus den fotografierten Rechnungsseiten. Spalten:
 *   ean    – zweite Nummer der Zeile (EAN/GTIN), nicht die Iden-Artikelnummer
 *   name   – gekürzte Bezeichnung fürs Regal
 *   menge  – Stück
 *   uvp    – unverbindliche Preisempfehlung, brutto (Ladenpreis)
 *   vk     – "VK-Preis" der Rechnung: Listenpreis des Lieferanten, netto
 *   rabatt – Einkaufsrabatt dieser Zeile (0, 0.1 oder 0.2)
 *   betrag – Zeilenbetrag laut Rechnung, netto – dient nur der Gegenprobe
 *   gruppe – Warengruppe
 *
 * Nicht enthalten: je Rechnung die Servicegebühr 3,95 €.
 */

export const POSITIONEN = [
  // === 26080067333 · Seite 1 ===================================================
  { ean: "4003801874173", name: "Rollhocker SuperStep schwarz", menge: 1, uvp: 74.9, vk: 37.48, rabatt: 0.1, betrag: 33.73, gruppe: "Geschenkartikel" },
  { ean: "4008789718730", name: "Playmobil City Action Polizei-Kommandozentrale", menge: 1, uvp: 99.99, vk: 58.82, rabatt: 0, betrag: 58.82, gruppe: "Spielwaren" },
  { ean: "4008789721914", name: "Playmobil City Action Große Feuerwehrstation", menge: 1, uvp: 89.99, vk: 57.62, rabatt: 0, betrag: 57.62, gruppe: "Spielwaren" },
  { ean: "4001702030414", name: "Bruder Traktor Fendt 936 Vario Frontlader grün 1:16", menge: 4, uvp: 48.79, vk: 23.89, rabatt: 0, betrag: 95.56, gruppe: "Spielwaren" },
  { ean: "4001702026738", name: "Bruder MB Sprinter Feuerwehr rot 1:16", menge: 4, uvp: 60.49, vk: 29.49, rabatt: 0, betrag: 117.96, gruppe: "Spielwaren" },
  { ean: "4001702034122", name: "Bruder Gelenkradlader XL5000 gelb/weiß 1:16", menge: 4, uvp: 33.49, vk: 16.29, rabatt: 0, betrag: 65.16, gruppe: "Spielwaren" },
  { ean: "4001702025007", name: "Bruder Pickup RAM 2500 Power Wagon rot/schwarz 1:16", menge: 2, uvp: 41.79, vk: 20.49, rabatt: 0, betrag: 40.98, gruppe: "Spielwaren" },
  { ean: "4001702026769", name: "Bruder MB Sprinter Ambulanz mit Figur rot/weiß 1:16", menge: 2, uvp: 65.79, vk: 32.29, rabatt: 0, betrag: 64.58, gruppe: "Spielwaren" },
  { ean: "4001167838396", name: "Zapf Baby Born Puppe Annabell 43 cm", menge: 1, uvp: 69.99, vk: 51.2, rabatt: 0, betrag: 51.2, gruppe: "Spielwaren" },
  { ean: "4001167840078", name: "Zapf Baby Born Puppe Jonas Click & Play 43 cm", menge: 1, uvp: 59.99, vk: 44.0, rabatt: 0, betrag: 44.0, gruppe: "Spielwaren" },
  { ean: "4001167838426", name: "Zapf Baby Born Puppe Emily Lauf mit mir 43 cm", menge: 1, uvp: 59.99, vk: 44.0, rabatt: 0, betrag: 44.0, gruppe: "Spielwaren" },
  { ean: "4029811406104", name: "LED Grablicht rot 12,5x7 cm", menge: 36, uvp: 2.49, vk: 1.49, rabatt: 0.1, betrag: 48.28, gruppe: "Geschenkartikel" },
  // === 26080067333 · Seite 2 ===================================================
  { ean: "4009207431026", name: "Stumpenkerze rot 40x80 mm, 4 Stück", menge: 40, uvp: 1.99, vk: 1.19, rabatt: 0.1, betrag: 42.84, gruppe: "Geschenkartikel" },
  { ean: "4009207427029", name: "Stumpenkerze rot 70x130 mm", menge: 20, uvp: 2.79, vk: 1.39, rabatt: 0.1, betrag: 25.02, gruppe: "Geschenkartikel" },
  { ean: "4009207437028", name: "Stumpenkerze rot 80x200 mm", menge: 30, uvp: 5.99, vk: 2.99, rabatt: 0.1, betrag: 80.73, gruppe: "Geschenkartikel" },
  { ean: "5702017815480", name: "LEGO Minecraft Begegnung mit dem Wächter", menge: 2, uvp: 19.99, vk: 12.57, rabatt: 0.1, betrag: 22.63, gruppe: "Spielwaren" },
  { ean: "5702017582894", name: "LEGO City Doppeldeckerbus", menge: 1, uvp: 29.99, vk: 18.47, rabatt: 0.1, betrag: 16.62, gruppe: "Spielwaren" },

  // === 26080067334 · Seite 1 ===================================================
  { ean: "4064997501649", name: "Idena LED Tischleuchte Touch orange 9x24,5 cm", menge: 6, uvp: 9.99, vk: 4.19, rabatt: 0, betrag: 25.14, gruppe: "Glühbirnen" },
  { ean: "4064997501625", name: "Idena LED Tischleuchte Touch blau 9x24,5 cm", menge: 6, uvp: 9.99, vk: 4.19, rabatt: 0, betrag: 25.14, gruppe: "Glühbirnen" },
  { ean: "4064997501632", name: "Idena LED Tischleuchte Touch gelb 9x24,5 cm", menge: 6, uvp: 9.99, vk: 4.19, rabatt: 0, betrag: 25.14, gruppe: "Glühbirnen" },
  { ean: "4064997501533", name: "Idena LED Tischleuchte Touch Metall grau 11x24/38 cm", menge: 6, uvp: 14.99, vk: 7.99, rabatt: 0.2, betrag: 38.35, gruppe: "Glühbirnen" },
  { ean: "4064997501526", name: "Idena LED Tischleuchte Touch Metall beige 11x24/38 cm", menge: 6, uvp: 14.99, vk: 7.99, rabatt: 0.2, betrag: 38.35, gruppe: "Glühbirnen" },
  { ean: "4064997501540", name: "Idena LED Tischleuchte Tango Metall schwarz 15x33 cm", menge: 6, uvp: 12.99, vk: 6.99, rabatt: 0.2, betrag: 33.55, gruppe: "Glühbirnen" },
  { ean: "4064997501236", name: "Idena LED Tischleuchte Touch Metall schwarz 11x24/38 cm", menge: 6, uvp: 14.99, vk: 7.99, rabatt: 0.2, betrag: 38.35, gruppe: "Glühbirnen" },
  { ean: "4064997501564", name: "Idena LED Tischleuchte Fado Metall schwarz 10x16,5 cm USB-C", menge: 12, uvp: 9.99, vk: 4.99, rabatt: 0.2, betrag: 47.9, gruppe: "Glühbirnen" },
  { ean: "4064997501243", name: "Idena LED Tischleuchte Touch Metall weiß 11x24/38 cm", menge: 6, uvp: 14.99, vk: 7.99, rabatt: 0.2, betrag: 38.35, gruppe: "Glühbirnen" },
  // === 26080067334 · Seite 2 ===================================================
  { ean: "4064997501229", name: "Idena LED Tischleuchte Touch Metall weiß 9,5x29 cm", menge: 6, uvp: 12.99, vk: 6.99, rabatt: 0.2, betrag: 33.55, gruppe: "Glühbirnen" },
  { ean: "4064997318773", name: "Idena LED Lampe Riako warmweiß 16x29 cm USB-C", menge: 6, uvp: 19.99, vk: 9.99, rabatt: 0.2, betrag: 47.95, gruppe: "Glühbirnen" },
  { ean: "4064997501458", name: "Idena Projektor Sternenhimmel 16,2x16,2x13 cm", menge: 12, uvp: 9.99, vk: 3.99, rabatt: 0.2, betrag: 38.3, gruppe: "Glühbirnen" },
  { ean: "4064997312696", name: "Idena LED Lichterkette NewTec 200er warmweiß/weiß 27,9 m", menge: 12, uvp: 14.99, vk: 7.99, rabatt: 0, betrag: 95.88, gruppe: "Glühbirnen" },
  { ean: "4064997305223", name: "Idena Kugellichterkette Zweig 120 LED warmweiß/RGB 7 m", menge: 9, uvp: 19.99, vk: 9.99, rabatt: 0, betrag: 89.91, gruppe: "Glühbirnen" },
  { ean: "4002372052829", name: "Idena LED Lichterkette 20 LED warmweiß 1,8 m", menge: 48, uvp: 2.49, vk: 1.29, rabatt: 0.2, betrag: 49.54, gruppe: "Glühbirnen" },
  { ean: "4064997313396", name: "Idena LED Lichterkette NewTec 360er warmweiß 43,9 m", menge: 12, uvp: 19.99, vk: 9.99, rabatt: 0, betrag: 119.88, gruppe: "Glühbirnen" },
  { ean: "4064997310401", name: "Idena LED Lichterkette NewTec Baum-Überwurf 200 LED warmweiß", menge: 8, uvp: 19.99, vk: 9.99, rabatt: 0.2, betrag: 63.94, gruppe: "Glühbirnen" },
  { ean: "4002372325398", name: "Idena LED Lichterkette 40 LED warmweiß 8,9 m", menge: 24, uvp: 7.99, vk: 3.99, rabatt: 0.2, betrag: 76.61, gruppe: "Glühbirnen" },
  { ean: "4002372325411", name: "Idena LED Lichterkette 80 LED warmweiß 15,9 m", menge: 18, uvp: 9.99, vk: 4.99, rabatt: 0.2, betrag: 71.86, gruppe: "Glühbirnen" },
  { ean: "4002372325428", name: "Idena LED Lichterkette 80 LED multicolor 16 m", menge: 18, uvp: 9.99, vk: 4.99, rabatt: 0, betrag: 89.82, gruppe: "Glühbirnen" },
  { ean: "4064997305216", name: "Idena LED Lichterkette RGB Smart 100 LED USB Bluetooth 12 m", menge: 48, uvp: 5.99, vk: 2.99, rabatt: 0, betrag: 143.52, gruppe: "Glühbirnen" },
  { ean: "4064997318995", name: "Idena LED Lichternetz warmweiß 2x1 m 160 LED", menge: 12, uvp: 12.99, vk: 6.99, rabatt: 0.2, betrag: 67.1, gruppe: "Glühbirnen" },
  { ean: "4064997302574", name: "Idena LED Mikro-Lichterkette 50 LED warmweiß USB 2,75 m", menge: 60, uvp: 2.49, vk: 1.29, rabatt: 0.2, betrag: 61.92, gruppe: "Glühbirnen" },
  { ean: "4002372089986", name: "Idena LED Teelichter Ø4x4 cm, 4 Stück", menge: 24, uvp: 1.99, vk: 0.99, rabatt: 0.2, betrag: 19.01, gruppe: "Glühbirnen" },
  // === 26080067334 · Seite 3 ===================================================
  { ean: "4064997500628", name: "Idena LED Echtwachskerzen im Glas 3er-Set warmweiß Ø7,5 cm", menge: 12, uvp: 12.99, vk: 6.99, rabatt: 0, betrag: 83.88, gruppe: "Glühbirnen" },
];

/** Nettosumme der Artikelzeilen laut Rechnung (ohne Servicegebühr 3,95 €). */
export const NETTO_333 = 913.68 - 3.95;
export const NETTO_334 = 1466.89 - 3.95;

export const MWST = 0.19;
const runde = (wert) => Math.round(wert * 100) / 100;

/** EK = Listenpreis abzüglich Rabatt, EH = UVP brutto, GH = UVP netto. */
export function preise(position) {
  return {
    ek: runde(position.vk * (1 - position.rabatt)),
    eh: runde(position.uvp),
    gh: runde(position.uvp / (1 + MWST)),
  };
}
