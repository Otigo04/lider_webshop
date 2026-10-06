import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_MUSTER,
  normalisiereCode,
  rabatte,
  zufallsCode,
} from "@/lib/rabatt";

test("ohne Kondition und Gutschein bleibt der Warenwert", () => {
  const r = rabatte(123.45, 0, null);
  assert.equal(r.kundenRabatt, 0);
  assert.equal(r.gutscheinRabatt, 0);
  assert.equal(r.netto, 123.45);
});

test("Sonderkondition 10 % auf den Warenwert", () => {
  const r = rabatte(200, 10);
  assert.equal(r.kundenRabatt, 20);
  assert.equal(r.netto, 180);
});

test("Kondition wird auf den Cent gerundet", () => {
  // 33,33 × 7,5 % = 2,49975 → 2,50
  const r = rabatte(33.33, 7.5);
  assert.equal(r.kundenRabatt, 2.5);
  assert.equal(r.netto, 30.83);
});

test("Prozent-Gutschein rechnet auf den Rest nach der Kondition", () => {
  const r = rabatte(200, 10, {
    code: "X",
    kind: "percent",
    value: 10,
    min_order_amount: 0,
  });
  // 200 − 20 = 180, davon 10 % = 18
  assert.equal(r.gutscheinRabatt, 18);
  assert.equal(r.netto, 162);
});

test("fester Gutschein höchstens bis auf null", () => {
  const r = rabatte(30, 0, {
    code: "X",
    kind: "fixed",
    value: 50,
    min_order_amount: 0,
  });
  assert.equal(r.gutscheinRabatt, 30);
  assert.equal(r.netto, 0);
});

test("Mindestwert gilt gegen den Warenwert vor Rabatt", () => {
  const gutschein = {
    code: "X",
    kind: "fixed" as const,
    value: 10,
    min_order_amount: 100,
  };
  const knapp = rabatte(99.99, 0, gutschein);
  assert.equal(knapp.mindestwertFehlt, true);
  assert.equal(knapp.gutscheinRabatt, 0);
  assert.equal(knapp.netto, 99.99);

  // Kondition drückt den Rest unter 100 – der Gutschein gilt trotzdem.
  const mitKondition = rabatte(100, 10, gutschein);
  assert.equal(mitKondition.mindestwertFehlt, false);
  assert.equal(mitKondition.netto, 80);
});

test("Satz von 100 % und mehr wird geklemmt, negative ignoriert", () => {
  assert.equal(rabatte(100, 150).kundenSatz, 99.99);
  assert.equal(rabatte(100, -5).kundenRabatt, 0);
});

test("Code-Normalisierung und Zufallscode", () => {
  assert.equal(normalisiereCode(" sommer 25 "), "SOMMER25");
  for (let i = 0; i < 50; i++) {
    const code = zufallsCode();
    assert.match(code, CODE_MUSTER);
    assert.doesNotMatch(code, /[01OIL]/);
  }
});
