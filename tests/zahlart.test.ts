import { test } from "node:test";
import assert from "node:assert/strict";
import {
  erlaubteZahlarten,
  istUeberweisung,
  vorgabeZahlart,
} from "@/lib/zahlart";

test("Erstbesteller, Versand: nur Vorkasse", () => {
  assert.deepEqual(erlaubteZahlarten("shipping", false), ["prepayment"]);
});

test("Erstbesteller, Abholung: Vorkasse, bar, Karte – keine Rechnung", () => {
  assert.deepEqual(erlaubteZahlarten("pickup", false), ["prepayment", "cash", "card"]);
});

test("Bestandskunde, Versand: Rechnung und Vorkasse", () => {
  assert.deepEqual(erlaubteZahlarten("shipping", true), ["transfer", "prepayment"]);
});

test("Bestandskunde, Abholung: alle vier", () => {
  assert.deepEqual(erlaubteZahlarten("pickup", true), [
    "transfer",
    "prepayment",
    "cash",
    "card",
  ]);
});

test("Vorgabe: Rechnung für Berechtigte, sonst Vorkasse", () => {
  assert.equal(vorgabeZahlart(true), "transfer");
  assert.equal(vorgabeZahlart(false), "prepayment");
});

test("istUeberweisung", () => {
  assert.equal(istUeberweisung("transfer"), true);
  assert.equal(istUeberweisung("prepayment"), true);
  assert.equal(istUeberweisung("cash"), false);
  assert.equal(istUeberweisung("card"), false);
});
