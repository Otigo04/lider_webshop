import ExcelJS from "exceljs";
import { summen, type BestandZeile } from "@/lib/bestand-export";

/**
 * Bestandsliste als Excel-Tabelle.
 *
 * Echte Zahlenzellen, damit sich in Excel rechnen und sortieren lässt; Artikel-
 * nummer und Barcode dagegen als Text, sonst frisst Excel die führende Null
 * („0196214147249“) und zeigt 1,96E+11. Die Summenzeile unten ist ein
 * SUBTOTAL: sie rechnet nur die Zeilen, die der Filter gerade zeigt.
 */
export async function baueXlsx(
  zeilen: BestandZeile[],
  mitEk: boolean,
  stand: Date,
): Promise<Buffer> {
  const mappe = new ExcelJS.Workbook();
  mappe.creator = "LIDER";
  mappe.created = stand;

  const blatt = mappe.addWorksheet("Bestand", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const spalten: Partial<ExcelJS.Column>[] = [
    { header: "Artikelnr.", key: "sku", width: 14 },
    { header: "Barcode", key: "barcode", width: 16 },
    { header: "Bezeichnung", key: "name", width: 56 },
    { header: "Warengruppe", key: "kategorie", width: 24 },
    { header: "Bestand", key: "bestand", width: 10 },
    { header: "Laden €", key: "laden", width: 12 },
    { header: "Großhandel €", key: "grosshandel", width: 14 },
  ];
  if (mitEk) {
    spalten.push(
      { header: "Einkauf €", key: "einkauf", width: 12 },
      { header: "Warenwert (EK) €", key: "warenwert", width: 18 },
    );
  }
  blatt.columns = spalten;

  const kopf = blatt.getRow(1);
  kopf.font = { bold: true };
  kopf.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  };
  kopf.alignment = { vertical: "middle" };

  for (const z of zeilen) {
    blatt.addRow({
      sku: z.sku,
      barcode: z.barcode ?? "",
      name: z.name,
      kategorie: z.kategorie,
      bestand: z.bestand,
      laden: z.laden ?? undefined,
      grosshandel: z.grosshandel ?? undefined,
      einkauf: mitEk ? (z.einkauf ?? undefined) : undefined,
      warenwert: mitEk ? (z.warenwert ?? undefined) : undefined,
    });
  }

  const euro = "#,##0.00";
  blatt.getColumn("sku").numFmt = "@";
  blatt.getColumn("barcode").numFmt = "@";
  blatt.getColumn("bestand").numFmt = "#,##0";
  for (const key of ["laden", "grosshandel", "einkauf", "warenwert"]) {
    blatt.getColumn(key).numFmt = euro;
  }
  // Die Kopfzeile bleibt Text, auch wenn die Spalte ein Zahlenformat trägt.
  kopf.numFmt = "@";

  const letzte = zeilen.length + 1;
  const spaltenzahl = spalten.length;
  blatt.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: spaltenzahl },
  };

  const s = summen(zeilen);
  const summe = blatt.addRow({ name: `Summe (${s.positionen} Artikel)` });
  summe.font = { bold: true };
  summe.border = { top: { style: "thin" } };
  const bestandsSpalte = blatt.getColumn("bestand").letter;
  summe.getCell("bestand").value = {
    formula: `SUBTOTAL(109,${bestandsSpalte}2:${bestandsSpalte}${letzte})`,
    result: s.stueck,
  };
  if (mitEk) {
    const wertSpalte = blatt.getColumn("warenwert").letter;
    summe.getCell("warenwert").value = {
      formula: `SUBTOTAL(109,${wertSpalte}2:${wertSpalte}${letzte})`,
      result: s.warenwertEk ?? 0,
    };
  }

  return Buffer.from(await mappe.xlsx.writeBuffer());
}
