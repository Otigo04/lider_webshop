import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTier,
  minOrderQuantity,
  lowestUnitPrice,
  priceRange,
  discountPercent,
  reduzierung,
  lineTotal,
  counterUnitPrice,
  freeStock,
  stockLevel,
  marge,
} from "@/lib/pricing";

const tier = (min: number, max: number | null, preis: number) => ({
  id: `t${min}`,
  min_quantity: min,
  max_quantity: max,
  unit_price: preis,
});

// Das Beispiel aus CLAUDE.md: 10–49 → 1,50 · 50–199 → 1,30 · 200+ → 1,10
const staffeln = [tier(200, null, 1.1), tier(10, 49, 1.5), tier(50, 199, 1.3)];

test("Staffel nach Menge, unabhängig von der Reihenfolge der Eingabe", () => {
  assert.equal(resolveTier(staffeln, 10)?.unit_price, 1.5);
  assert.equal(resolveTier(staffeln, 49)?.unit_price, 1.5);
  assert.equal(resolveTier(staffeln, 50)?.unit_price, 1.3);
  assert.equal(resolveTier(staffeln, 199)?.unit_price, 1.3);
  assert.equal(resolveTier(staffeln, 200)?.unit_price, 1.1);
  assert.equal(resolveTier(staffeln, 5000)?.unit_price, 1.1);
});

test("unter der Mindestmenge greift keine Staffel", () => {
  assert.equal(resolveTier(staffeln, 9), null);
  assert.equal(resolveTier([], 10), null);
  assert.equal(lineTotal(staffeln, 9), 0);
});

test("Lücke zwischen Staffeln: es gilt die zuletzt erreichte Stufe", () => {
  const luecke = [tier(1, 49, 2), tier(100, null, 1)];
  assert.equal(resolveTier(luecke, 60)?.unit_price, 2);
  assert.equal(resolveTier(luecke, 100)?.unit_price, 1);
});

test("Mindestmenge, ab-Preis und Spanne", () => {
  assert.equal(minOrderQuantity(staffeln), 10);
  assert.equal(minOrderQuantity([]), 0);
  assert.equal(lowestUnitPrice(staffeln), 1.1);
  assert.deepEqual(priceRange(staffeln), { from: 1.1, to: 1.5 });
  assert.deepEqual(priceRange([tier(1, null, 2)]), { from: 2, to: null });
  assert.equal(priceRange([]), null);
});

test("Preise kommen als String über PostgREST und werden gelesen", () => {
  const s = [{ ...tier(1, null, 0), unit_price: "2.50" as unknown as number }];
  assert.equal(lowestUnitPrice(s), 2.5);
  assert.equal(lineTotal(s, 4), 10);
});

test("Positionssumme", () => {
  assert.equal(lineTotal(staffeln, 50), 65);
});

test("Rabatt gegenüber der kleinsten Staffel", () => {
  assert.equal(discountPercent(staffeln, staffeln[1]), null); // kleinste selbst
  assert.equal(discountPercent(staffeln, staffeln[2]), 13); // 1,50 → 1,30
  assert.equal(discountPercent(staffeln, staffeln[0]), 27); // 1,50 → 1,10
});

test("Reduzierung: nur mit Ladenpreis, nur wenn der Vorher-Preis darüber liegt", () => {
  // Laden 8,99, vorher 9,99 → 10 %
  assert.deepEqual(reduzierung(9.99, 8.99, 8.99), {
    vorher: 9.99,
    jetzt: 8.99,
    prozent: 10,
  });
  // ohne Ladenpreis keine Reduzierung – kein erfundener Rabatt
  assert.equal(reduzierung(9.99, 4.5, null), null);
  assert.equal(reduzierung(9.99, 4.5, 0), null);
  // Vorher nicht über dem Ladenpreis
  assert.equal(reduzierung(8.99, 8.99, 8.99), null);
  assert.equal(reduzierung(5, 8.99, 8.99), null);
  // fehlende Angaben
  assert.equal(reduzierung(null, 8.99, 8.99), null);
  assert.equal(reduzierung(9.99, undefined, 8.99), null);
});

test("Reduzierung: ein Cent Unterschied ist kein Angebot", () => {
  assert.equal(reduzierung(100.01, 100, 100), null);
});

test("Reduzierung im Shop: Prozentsatz wird auf den Großhandelspreis übertragen", () => {
  // Laden 9,99 → 8,99 (10 %); Großhandel 4,50. Streichpreis ~5,00, nicht 4,50 → 55 %.
  const r = reduzierung(9.99, 4.5, 8.99);
  assert.ok(r);
  assert.equal(r.prozent, 10);
  assert.equal(r.jetzt, 4.5);
  assert.equal(r.vorher, 5);
});

test("Kassenpreis: Privatkunde zahlt Ladenpreis, Händler die Staffel", () => {
  const p = { variants: staffeln, retailPrice: 2.99 };
  assert.equal(counterUnitPrice(p, 50, "retail"), 2.99);
  assert.equal(counterUnitPrice(p, 50, "wholesale"), 1.3);
});

test("Kassenpreis ohne Ladenpreis fällt auf die Staffel zurück", () => {
  const p = { variants: staffeln, retailPrice: null };
  assert.equal(counterUnitPrice(p, 50, "retail"), 1.3);
  // unter der Mindestmenge: kleinste Staffel
  assert.equal(counterUnitPrice(p, 1, "wholesale"), 1.5);
  assert.equal(counterUnitPrice({ variants: [], retailPrice: null }, 1, "wholesale"), 0);
});

test("freier Bestand ist nie negativ", () => {
  assert.equal(freeStock({ stock_available: 20, stock_reserved: 5 }), 15);
  assert.equal(freeStock({ stock_available: 3, stock_reserved: 5 }), 0);
});

test("Bestandsstufen", () => {
  assert.equal(stockLevel(0), "out");
  assert.equal(stockLevel(-1), "out");
  assert.equal(stockLevel(9), "low");
  assert.equal(stockLevel(10), "ok");
});

test("Marge rechnet auf den Verkaufspreis", () => {
  assert.deepEqual(marge(10, 6), { einkauf: 6, prozent: 40 });
  assert.deepEqual(marge("12.80", "7.40"), { einkauf: 7.4, prozent: 42 });
});

test("Marge: negativ erlaubt, ohne Einkaufspreis keine Angabe", () => {
  assert.equal(marge(5, 8)?.prozent, -60);
  assert.equal(marge(5, null), null);
  assert.equal(marge(5, undefined), null);
  assert.equal(marge(5, ""), null);
  assert.equal(marge(5, 0), null);
  assert.deepEqual(marge(0, 4), { einkauf: 4, prozent: 0 });
});
