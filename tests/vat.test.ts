import { test } from "node:test";
import assert from "node:assert/strict";
import { steuer, brutto } from "@/lib/vat";

test("19 % auf einen glatten Betrag", () => {
  assert.deepEqual(steuer(100, 19), {
    netto: 100,
    steuer: 19,
    brutto: 119,
    satz: 19,
  });
});

test("Steuer wird auf den ganzen Cent gerundet", () => {
  // 3,33 * 19 % = 0,6327 → 0,63
  assert.equal(steuer(3.33, 19).steuer, 0.63);
  // 0,05 * 19 % = 0,0095 → 0,01 (kaufmännisch aufwärts)
  assert.equal(steuer(0.05, 19).steuer, 0.01);
});

test("Rundung auf die Summe, nicht auf die Zeile", () => {
  // Zehn Zeilen à 0,07 €: je Zeile gerundet 10 × 0,01 = 0,10 €, auf die
  // Summe 0,70 € sind es 0,13 €. Der Kunde überweist den Summenwert.
  const summe = steuer(0.7, 19).steuer;
  assert.equal(summe, 0.13);
  assert.notEqual(summe, 10 * steuer(0.07, 19).steuer);
});

test("Brutto trägt keine Gleitkomma-Reste", () => {
  // 0,05 + 0,01 ist in Gleitkomma 0,060000000000000005 – eine Rechnung
  // darf nicht an solchen Werten hängen (Vergleich, Export, PDF).
  for (let cent = 1; cent <= 5000; cent++) {
    const r = steuer(cent / 100, 19);
    assert.equal(r.brutto, Math.round(r.brutto * 100) / 100, `netto ${cent / 100}`);
  }
});

test("Brutto ist netto plus Steuer", () => {
  const r = steuer(12.34, 19);
  assert.equal(r.brutto, r.netto + r.steuer);
  assert.equal(brutto(12.34, 19), r.brutto);
});

test("Satz 0, negativ oder ungültig heißt keine Steuer", () => {
  for (const satz of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = steuer(50, satz);
    assert.equal(r.steuer, 0, `Satz ${satz}`);
    assert.equal(r.brutto, 50);
    assert.equal(r.satz, 0);
  }
});

test("Netto wird auf den Cent gerundet", () => {
  assert.equal(steuer(10.004, 19).netto, 10);
});
