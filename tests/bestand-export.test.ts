import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ohneEinkauf,
  sortiere,
  summen,
  warenwert,
  type BestandZeile,
} from "@/lib/bestand-export";

function zeile(teil: Partial<BestandZeile>): BestandZeile {
  return {
    sku: "1",
    barcode: null,
    name: "A",
    kategorie: "Spielwaren",
    bestand: 1,
    laden: null,
    grosshandel: null,
    einkauf: null,
    warenwert: null,
    ...teil,
  };
}

test("Warenwert: Bestand × Einkauf auf den Cent, ohne Einkauf keiner", () => {
  assert.equal(warenwert(120, 0.98), 117.6);
  assert.equal(warenwert(3, 1.1), 3.3);
  assert.equal(warenwert(5, null), null);
});

test("negativer Bestand ist kein negativer Warenwert", () => {
  assert.equal(warenwert(-4, 2), 0);
});

test("sortiert nach Warengruppe, dann Bezeichnung, Umlaute und Zahlen richtig", () => {
  const liste = sortiere([
    zeile({ kategorie: "Spielwaren", name: "Zebra" }),
    zeile({ kategorie: "Batterien", name: "Ärmel" }),
    zeile({ kategorie: "Spielwaren", name: "Ball 10" }),
    zeile({ kategorie: "Spielwaren", name: "Ball 2" }),
    zeile({ kategorie: "Batterien", name: "Akku" }),
  ]);
  assert.deepEqual(
    liste.map((z) => z.name),
    ["Akku", "Ärmel", "Ball 2", "Ball 10", "Zebra"],
  );
});

test("Summen: Stück ohne Minusbestand, Warenwert nur aus gepflegten Zeilen", () => {
  const s = summen([
    zeile({ bestand: 10, warenwert: 9.8 }),
    zeile({ bestand: -2, warenwert: 0 }),
    zeile({ bestand: 5, warenwert: null }),
  ]);
  assert.equal(s.positionen, 3);
  assert.equal(s.stueck, 15);
  assert.equal(s.warenwertEk, 9.8);
});

test("Summen ohne jeden Einkaufspreis: kein Warenwert statt 0 €", () => {
  assert.equal(summen([zeile({ warenwert: null })]).warenwertEk, null);
});

test("ohneEinkauf entfernt Einkaufspreis und Warenwert, sonst nichts", () => {
  const [z] = ohneEinkauf([zeile({ einkauf: 2, warenwert: 20, laden: 3.99 })]);
  assert.equal(z.einkauf, null);
  assert.equal(z.warenwert, null);
  assert.equal(z.laden, 3.99);
});
