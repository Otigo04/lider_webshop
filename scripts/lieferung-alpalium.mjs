/**
 * Lieferung Alpalium GmbH, zwei Aufträge vom 14./15.09.2026:
 *   AU-202609-14157 (55 Positionen, Rechnung auf 30 Tage netto)
 *   AU-202609-14163 (34 Positionen, Vorauszahlung netto)
 *
 * Abgetippt aus den Auftragsbestätigungen. Spalte "E-Preis" ist dort der
 * Einkaufspreis je Stück (netto) – eine Verkaufsseite gibt es auf diesen
 * Belegen nicht, GH- und Ladenpreis werden hier erst draus gebildet:
 *
 *   GH (Großhandel, an Einzelhändler)  = EK × 1,30, aufgerundet auf 10 Cent
 *   EH (Laden, an Endkunden)           = EK × 2,00, aufgerundet auf X,99 €
 *
 * Aufgerundet, nie abgerundet – ein Preis unter dem Einkauf darf nie
 * entstehen, und "1,87 €" ist keine Zahl, die am Regal stehen soll.
 *
 * "Menge" auf dem Beleg zählt Verkaufseinheiten (Blister/Boxen), nicht
 * einzelne Zellen – ein Artikel hier ist "4er Blister", nicht "1 Batterie".
 * Jede Zeile wird genauso geführt: ein Blister ist ein Stück Bestand.
 *
 * Kein EAN auf dem Beleg, deshalb kein Barcode-Abgleich möglich – alle
 * Positionen sind Neuanlagen in der eigens angelegten Warengruppe
 * "Batterien" (Batterie-Artikel) bzw. in "Elektronik-Zubehör" (die acht
 * Elektroartikel am Ende von AU-202609-14157: Steckdosenleisten, Adapter,
 * Verlängerungskabel).
 */

/** AU-202609-14157 */
const BATTERIEN_14157 = [
  ["30000406", "Panasonic Zink Kohle R6/AA 4er Blister", 240, 0.39],
  ["30000214", "Panasonic Zink Kohle R14/C 2er Blister", 120, 0.50],
  ["40000403", "VARTA Super Heavy Duty AAA/R03 4er Blister", 120, 0.45],
  ["40000406", "VARTA Super Heavy Duty AA/R6 4er Blister", 120, 0.45],
  ["40000214", "VARTA Super Heavy Duty C/R14 2er Blister", 60, 0.54],
  ["40000122", "VARTA Super Heavy Duty 9 Volt 1er Blister", 50, 0.54],
  ["40000112", "VARTA Super Heavy Duty 3R12 4,5V 1er Blister", 20, 0.87],
  ["42000403", "VARTA Longlife LR03/AAA 4er Blister", 10, 0.97],
  ["42000406", "VARTA Longlife LR6/AA 4er Blister", 20, 0.97],
  ["42100220", "VARTA Longlife LR20/D 2er Blister", 12, 1.49],
  ["42000122", "VARTA Longlife 6LR61 9V Block 1er Blister", 20, 0.99],
  ["43000403", "VARTA Longlife Power LR03/AAA 4er Blister", 100, 0.93],
  ["43000406", "VARTA Longlife Power LR6/AA 4er Blister", 220, 0.93],
  ["43100220", "VARTA Longlife Power LR20/D 2er Blister", 30, 1.50],
  ["43100214", "VARTA Longlife Power LR14/C 2er Blister", 24, 0.95],
  ["43000122", "VARTA Longlife Power 9 Volt Block 1er Blister", 50, 0.95],
  ["43000112", "VARTA Longlife Power 3LR12 1er Blister", 10, 2.09],
  ["47001216", "VARTA Lithium Knopfzelle CR1216", 10, 0.69],
  ["47001122", "VARTA Lithium Knopfzelle CR1220", 10, 0.64],
  ["47001225", "VARTA Lithium Knopfzelle CR1225", 10, 1.19],
  ["47001616", "VARTA Lithium Knopfzelle CR1616", 10, 0.59],
  ["47001620", "VARTA Lithium Knopfzelle CR1620", 10, 0.77],
  ["47001632", "VARTA Lithium Knopfzelle CR1632", 20, 1.11],
  ["47002025", "VARTA Lithium Knopfzelle CR2025", 60, 0.36],
  ["47002032", "VARTA Lithium Knopfzelle CR2032", 60, 0.36],
  ["47002430", "VARTA Lithium Knopfzelle CR2430", 30, 0.67],
  ["47002450", "VARTA Lithium Knopfzelle CR2450", 50, 1.12],
  ["47501123", "VARTA Lithium CR123A 3V", 10, 1.36],
  ["47501142", "VARTA Lithium CR2 3V", 10, 1.64],
  ["48000123", "VARTA Alkaline V23GA/MN21 12V", 20, 0.52],
  ["48000127", "VARTA Alkaline V27GA/MN27 12V", 20, 0.73],
  ["46000364", "VARTA Silberoxid Knopfzelle V364/SR60", 100, 0.27],
  ["46000371", "VARTA Silberoxid Knopfzelle V371/SR69", 10, 0.34],
  ["46000377", "VARTA Silberoxid Knopfzelle V377/SR66", 100, 0.27],
  ["46000317", "VARTA Silberoxid Knopfzelle V317/SR62", 50, 0.59],
  ["46000319", "VARTA Silberoxid Knopfzelle V319/SR64", 60, 0.69],
  ["49021206", "VARTA Recharge Akku Power AA 2100mAh 2er Blister", 10, 3.18],
  ["49455203", "VARTA Recharge Akku Solar AAA 550mAh 2er Blister", 10, 2.34],
  ["61000403", "KODAK Max Super Alkaline LR03/AAA, 4er", 30, 0.72],
  ["61000214", "KODAK Max Super Alkaline LR14/C, 2er", 30, 0.95],
  ["61000220", "KODAK Max Super Alkaline LR20/D, 2er", 20, 1.49],
  ["61000122", "KODAK Max Super Alkaline 6LR61 9V-Block", 20, 0.95],
  ["70000406", "PHILIPS Extra Zinc Chloride R6/AA, 4er", 72, 0.39],
  ["70000403", "PHILIPS Extra Zinc Chloride R03/AAA, 4er", 72, 0.39],
  ["58406010", "Duracell Activair Zink Luft A10/PR70, 6er Box", 30, 1.24],
  ["58406013", "Duracell Activair Zink Luft A13/PR48, 6er Box", 50, 1.24],
  ["58406312", "Duracell Activair Zink Luft A312/PR41, 6er Box", 50, 1.24],
];

/** Elektroartikel, Ende AU-202609-14157 – eigene Warengruppe (kein Batterie-Artikel) */
const ELEKTRO_14157 = [
  ["82100003", "Steckdosenleiste 3fach mit Schalter, 1,4 m", 50, 2.24],
  ["82100005", "Steckdosenleiste 5fach mit Schalter, 1,4 m", 50, 2.94],
  ["82100008", "Steckdosenleiste 8fach mit Schalter, 1,4 m", 30, 3.69],
  ["82200003", "Schuko-Euro-Stecker Adapter 2+1", 20, 0.99],
  ["82300001", "Schuko-Euro-Stecker Adapter 1fach mit Schalter", 20, 0.99],
  ["82300003", "Schuko-Euro-Stecker Adapter 3fach mit Schalter", 20, 1.17],
  ["82400003", "Verlängerungskabel 3 m, IP20", 20, 2.97],
  ["82400005", "Verlängerungskabel 5 m, IP20", 20, 3.69],
];

/** AU-202609-14163 (Eigenmarke ALPALIUM) */
const BATTERIEN_14163 = [
  ["11001603", "ALPALIUM Super Heavy Duty R03/AAA, 16er Blister", 240, 0.97],
  ["11001606", "ALPALIUM Super Heavy Duty R6/AA, 16er Blister", 240, 0.97],
  ["15005216", "ALPALIUM Lithium Knopfzelle CR1216, 5er", 20, 0.62],
  ["15005122", "ALPALIUM Lithium Knopfzelle CR1220, 5er", 20, 0.62],
  ["15005225", "ALPALIUM Lithium Knopfzelle CR1225, 5er", 20, 0.62],
  ["15005161", "ALPALIUM Lithium Knopfzelle CR1616, 5er", 20, 0.62],
  ["15005620", "ALPALIUM Lithium Knopfzelle CR1620, 5er", 20, 0.62],
  ["15005632", "ALPALIUM Lithium Knopfzelle CR1632, 5er", 20, 0.62],
  ["15005016", "ALPALIUM Lithium Knopfzelle CR2016, 5er", 20, 0.62],
  ["15005025", "ALPALIUM Lithium Knopfzelle CR2025, 5er", 100, 0.62],
  ["15005032", "ALPALIUM Lithium Knopfzelle CR2032, 5er", 400, 0.62],
  ["15005430", "ALPALIUM Lithium Knopfzelle CR2430, 5er", 40, 1.37],
  ["15005450", "ALPALIUM Lithium Knopfzelle CR2450, 5er", 100, 1.42],
  // Pos. 14+15 derselben Rechnung: gleiche Art.-Nr., zwei Zeilen – als eine
  // Position mit addierter Menge geführt (80+40), wie beim Scannen auch.
  ["14051000", "ALPALIUM Alkaline Knopfzelle AG0/LR63", 120, 0.49],
  ["14051002", "ALPALIUM Alkaline Knopfzelle AG2/LR59", 60, 0.49],
  ["14051003", "ALPALIUM Alkaline Knopfzelle AG3/LR41", 100, 0.49],
  ["14051004", "ALPALIUM Alkaline Knopfzelle AG4/LR66", 400, 0.49],
  ["14051005", "ALPALIUM Alkaline Knopfzelle AG5/LR48", 40, 0.49],
  ["14051006", "ALPALIUM Alkaline Knopfzelle AG6/LR69", 80, 0.49],
  ["14051007", "ALPALIUM Alkaline Knopfzelle AG7/LR57", 60, 0.49],
  ["14051008", "ALPALIUM Alkaline Knopfzelle AG8/LR55", 60, 0.49],
  ["14051009", "ALPALIUM Alkaline Knopfzelle AG9/LR45", 60, 0.49],
  ["14051010", "ALPALIUM Alkaline Knopfzelle AG10/LR54", 60, 0.49],
  ["14051011", "ALPALIUM Alkaline Knopfzelle AG11/LR58", 60, 0.49],
  ["14051012", "ALPALIUM Alkaline Knopfzelle AG12/LR43", 60, 0.49],
  ["14051013", "ALPALIUM Alkaline Knopfzelle AG13/LR44", 400, 0.49],
  ["12102403", "ALPALIUM Alkaline LR03/AAA, 24er Pack", 12, 2.79],
  ["12102406", "ALPALIUM Alkaline LR6/AA, 24er Pack", 12, 2.79],
  ["18006203", "ALPALIUM Akku NI-MH HR03/AAA 600mAh, 2er", 120, 1.04],
  ["18106403", "ALPALIUM Akku NI-MH HR03/AAA 600mAh, 4er Shrink", 120, 1.58],
  ["18008206", "ALPALIUM Akku NI-MH HR6/AA 800mAh, 2er", 60, 1.19],
  ["18011203", "ALPALIUM Akku NI-MH HR03/AAA 1100mAh, 2er", 120, 1.38],
  ["18027206", "ALPALIUM Akku NI-MH HR6/AA 2700mAh, 2er", 12, 1.35],
];

export const BATTERIEN = [...BATTERIEN_14157, ...BATTERIEN_14163];
export const ELEKTRO = ELEKTRO_14157;

/** Aufrunden auf 10-Cent-Schritte – für den Großhandelspreis. */
function ghPreis(ek) {
  const ekCent = Math.round(ek * 100);
  const mindest = Math.ceil(ekCent * 1.3);
  const centsAuf10 = Math.ceil(mindest / 10) * 10;
  return centsAuf10 / 100;
}

/** Aufrunden auf die nächste X,99 € – für den Ladenpreis. */
function ehPreis(ek) {
  const ekCent = Math.round(ek * 100);
  const mindest = ekCent * 2;
  const euro = Math.floor(mindest / 100);
  const basis99 = euro * 100 + 99;
  const cents = basis99 >= mindest ? basis99 : basis99 + 100;
  return cents / 100;
}

export function preise(ek) {
  return { ek, gh: ghPreis(ek), eh: ehPreis(ek) };
}
