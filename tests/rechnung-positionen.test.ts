import { test } from "node:test";
import assert from "node:assert/strict";
import {
  belegSummen,
  findeArtikel,
  istCode,
  positionenAusBestellung,
  positionenPayload,
  positionsFehler,
  stufenpreis,
  type Position,
} from "@/lib/rechnung-positionen";

const kat = (menge: number, preis: number, extra = {}): Position => ({
  art: "katalog",
  key: "k",
  productId: "11111111-1111-4111-8111-111111111111",
  quantity: menge,
  unitPrice: preis,
  preisManuell: false,
  ...extra,
});
const frei = (menge: number, preis: number, extra = {}): Position => ({
  art: "frei",
  key: "f",
  barcode: "",
  description: "Lieferung",
  quantity: menge,
  unitPrice: preis,
  ...extra,
});

test("Code oder Wort: Strichcode und Artikelnummer sind Codes, Wörter nicht", () => {
  assert.equal(istCode("4006381333931"), true);
  assert.equal(istCode("12-0034"), true);
  assert.equal(istCode(" 4006381333931 "), true);
  assert.equal(istCode("Ladekabel"), false);
  assert.equal(istCode("USB Kabel 2m"), false);
  assert.equal(istCode("1234"), false);
});

test("Gescannter Code: genauer Treffer auf Barcode, sonst auf Artikelnummer", () => {
  const liste = [
    { id: "a", sku: "12-0034", barcode: "4006381333931" },
    { id: "b", sku: "12-0035", barcode: null },
  ];
  assert.equal(findeArtikel(liste, "4006381333931")?.id, "a");
  assert.equal(findeArtikel(liste, "12-0035")?.id, "b");
  assert.equal(findeArtikel(liste, "12-0034 ")?.id, "a");
  assert.equal(findeArtikel(liste, "4006381"), null, "Teilstück ist kein Treffer");
  assert.equal(findeArtikel(liste, ""), null);
});

test("Staffelpreis zur Menge", () => {
  const stufe = (min: number, preis: number) => ({
    id: `s${min}`,
    min_quantity: min,
    max_quantity: null,
    unit_price: preis,
  });
  const v = [stufe(1, 2.5), stufe(12, 2.2)];
  assert.equal(stufenpreis(v, 1), 2.5);
  assert.equal(stufenpreis(v, 12), 2.2);
  assert.equal(stufenpreis([], 1), null);
});

test("Sonderkondition nur auf Katalogzeilen, freie Zeilen voll", () => {
  const s = belegSummen([kat(10, 10), frei(1, 50)], 10);
  assert.equal(s.katalog, 100);
  assert.equal(s.frei, 50);
  assert.equal(s.warenwert, 150);
  assert.equal(s.kundenRabatt, 10, "10 % von 100, nicht von 150");
  assert.equal(s.netto, 140);
});

test("Ohne Kondition und nur frei: Summe ist die Summe", () => {
  assert.equal(belegSummen([frei(2, 12.5)], 0).netto, 25);
  assert.equal(belegSummen([frei(3, 0.1)], 15).netto, 0.3, "Kondition trifft freie Zeilen nie");
});

test("Payload: Katalog mit Preis, frei mit Beschreibung und Barcode", () => {
  const p = positionenPayload([
    kat(2, 1.5),
    frei(1, 9.9, { barcode: " 4006381333931 ", description: " Pfand " }),
  ]);
  assert.deepEqual(p[0], {
    product_id: "11111111-1111-4111-8111-111111111111",
    quantity: 2,
    unit_price: 1.5,
  });
  assert.deepEqual(p[1], {
    description: "Pfand",
    quantity: 1,
    unit_price: 9.9,
    barcode: "4006381333931",
  });
});

test("Prüfung vor dem Anlegen: nennt die erste fehlende Angabe", () => {
  assert.equal(positionsFehler([]), "Noch keine Position.");
  assert.equal(positionsFehler([kat(1, 2), frei(1, 5)]), null);
  assert.equal(positionsFehler([frei(1, 5, { description: "  " })]), "Position 1: Beschreibung fehlt.");
  assert.equal(positionsFehler([kat(1, 2), frei(1, 0)]), "Position 2: Preis fehlt.");
  assert.equal(positionsFehler([kat(0, 2)]), "Position 1: Menge fehlt.");
  assert.equal(positionsFehler([kat(1.5, 2)]), "Position 1: Menge fehlt.");
});

test("Lieferschein: kein Preis nötig, Menge und Beschreibung schon", () => {
  assert.equal(positionsFehler([frei(1, 0)], { ohnePreise: true }), null);
  assert.equal(positionsFehler([kat(1, 0)], { ohnePreise: true }), null);
  assert.equal(
    positionsFehler([frei(1, 0, { description: "" })], { ohnePreise: true }),
    "Position 1: Beschreibung fehlt.",
  );
  assert.equal(positionsFehler([kat(0, 0)], { ohnePreise: true }), "Position 1: Menge fehlt.");
});

test("Bearbeiten: Positionen der Bestellung kommen als Zeilen zurück", () => {
  const produkte = [{ id: "p1", sku: "12-0001" }];
  const z = positionenAusBestellung(
    [
      { product_sku: "12-0001", product_name: "Anti Stress Fisch", quantity: 12, unit_price: "2.50" },
      { product_sku: "", product_name: "Lieferung", quantity: 1, unit_price: 10, barcode: " 4006381333931 " },
      { product_sku: "99-9999", product_name: "Gelöschter Artikel", quantity: 2, unit_price: 3 },
    ],
    produkte,
  );
  assert.equal(z[0].art, "katalog");
  assert.equal(z[0].art === "katalog" && z[0].productId, "p1");
  assert.equal(z[0].unitPrice, 2.5);
  assert.equal(z[0].art === "katalog" && z[0].preisManuell, true);
  assert.equal(z[1].art, "frei");
  assert.equal(z[1].art === "frei" && z[1].barcode, "4006381333931");
  assert.equal(z[2].art, "frei");
  assert.equal(z[2].art === "frei" && z[2].description, "Gelöschter Artikel");
  assert.equal(new Set(z.map((p) => p.key)).size, 3, "Schlüssel sind eindeutig");
});
