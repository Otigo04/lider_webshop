import { test } from "node:test";
import assert from "node:assert/strict";
import { aufschlagPreis } from "@/lib/aufschlag";

const basis = { prozent: 10, mindestEuro: 0, rundung: "keine" as const };

test("Prozent auf den Einkauf, auf den Cent", () => {
  assert.equal(aufschlagPreis({ ...basis, ek: 10 }), 11);
  assert.equal(aufschlagPreis({ ...basis, ek: 5.54 }), 6.09);
  assert.equal(aufschlagPreis({ ...basis, ek: 35.07, prozent: 14 }), 39.98);
});

test("Mindestaufschlag greift bei billiger Ware", () => {
  // 10 % von 1 € = 0,10 €, Mindestaufschlag 0,50 € gewinnt
  assert.equal(aufschlagPreis({ ...basis, ek: 1, mindestEuro: 0.5 }), 1.5);
  // 10 % von 10 € = 1 € ist mehr als 0,50 €
  assert.equal(aufschlagPreis({ ...basis, ek: 10, mindestEuro: 0.5 }), 11);
});

test("Rundung nur nach oben", () => {
  assert.equal(aufschlagPreis({ ...basis, ek: 5.54, rundung: "5" }), 6.1);
  assert.equal(aufschlagPreis({ ...basis, ek: 5.54, rundung: "10" }), 6.1);
  assert.equal(aufschlagPreis({ ...basis, ek: 11.08, rundung: "5" }), 12.2);
  // schon glatt bleibt stehen
  assert.equal(aufschlagPreis({ ...basis, ek: 10, rundung: "5" }), 11);
});

test("Preisendung ,x9", () => {
  assert.equal(aufschlagPreis({ ...basis, ek: 10, rundung: "9" }), 11.09);
  assert.equal(aufschlagPreis({ ...basis, ek: 35.07, prozent: 14, rundung: "9" }), 39.99);
  assert.equal(aufschlagPreis({ ...basis, ek: 9.9, rundung: "9" }), 10.89);
  // endet schon auf 9
  assert.equal(aufschlagPreis({ ...basis, ek: 8.17, prozent: 10, rundung: "9" }), 8.99);
});

test("0 % mit Mindestbetrag", () => {
  assert.equal(aufschlagPreis({ ek: 4, prozent: 0, mindestEuro: 0.5, rundung: "keine" }), 4.5);
});
