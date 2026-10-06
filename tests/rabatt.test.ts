import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_MUSTER,
  gutscheinAnteil,
  normalisiereCode,
  unterEinkauf,
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

test("Gutschein für Warengruppen rechnet nur auf deren Anteil", () => {
  const gutschein = {
    code: "BATTERIEN10",
    kind: "percent" as const,
    value: 10,
    min_order_amount: 0,
    kategorien: ["Batterien"],
    artikel: ["b1", "b2"],
  };
  const anteil = gutscheinAnteil(gutschein, [
    { productId: "b1", summe: 30 },
    { productId: "b2", summe: 20 },
    { productId: "lego", summe: 150 },
  ]);
  assert.equal(anteil, 50);

  // Warenwert 200, davon 50 Batterien → 10 % von 50 = 5
  const ohneKondition = rabatte(200, 0, gutschein, anteil);
  assert.equal(ohneKondition.gutscheinRabatt, 5);
  assert.equal(ohneKondition.netto, 195);

  // Mit 10 % Sonderkondition: Anteil 50 − 5 = 45, davon 10 % = 4,50
  const mitKondition = rabatte(200, 10, gutschein, anteil);
  assert.equal(mitKondition.kundenRabatt, 20);
  assert.equal(mitKondition.gutscheinRabatt, 4.5);
  assert.equal(mitKondition.netto, 175.5);
});

test("Gutschein für Warengruppen: fester Betrag höchstens der Anteil", () => {
  const gutschein = {
    code: "X",
    kind: "fixed" as const,
    value: 25,
    min_order_amount: 0,
    artikel: ["b1"],
  };
  const r = rabatte(200, 0, gutschein, 12.5);
  assert.equal(r.gutscheinRabatt, 12.5);
  assert.equal(r.netto, 187.5);
});

test("Gutschein für Warengruppen: nichts davon im Korb, Mindestwert gegen den Anteil", () => {
  const gutschein = {
    code: "X",
    kind: "percent" as const,
    value: 10,
    min_order_amount: 40,
    artikel: [] as string[],
  };
  const leer = rabatte(
    200,
    0,
    gutschein,
    gutscheinAnteil(gutschein, [{ productId: "lego", summe: 200 }]),
  );
  assert.equal(leer.nichtAnwendbar, true);
  assert.equal(leer.gutscheinRabatt, 0);
  assert.equal(leer.netto, 200);

  // 30 € aus der Gruppe im Korb, Mindestwert 40 € – der übrige Korb zählt nicht.
  const knapp = rabatte(200, 0, { ...gutschein, artikel: ["b1"] }, 30);
  assert.equal(knapp.mindestwertFehlt, true);
  assert.equal(knapp.nichtAnwendbar, false);
  assert.equal(knapp.netto, 200);
});

test("Gutschein ohne Warengruppen: Anteil null ändert nichts", () => {
  const gutschein = { code: "X", kind: "percent" as const, value: 10, min_order_amount: 0 };
  assert.equal(gutscheinAnteil(gutschein, [{ productId: "a", summe: 5 }]), null);
  assert.deepEqual(rabatte(200, 10, gutschein, null), rabatte(200, 10, gutschein));
  assert.equal(rabatte(200, 10, gutschein).netto, 162);
});

test("Prozent-Gutschein gegen den Einkaufspreis", () => {
  const artikel = [
    { name: "Batterie", sku: "1", categoryId: "bat", preis: 1.0, ek: 0.85 },
    { name: "Kabel", sku: "2", categoryId: "handy", preis: 2.0, ek: 1.0 },
    { name: "Lego", sku: "3", categoryId: "spiel", preis: 10.0, ek: 9.5 },
  ];

  // 10 %: Batterie 0,90 ≥ 0,85, Kabel 1,80, Lego 9,00 < 9,50
  const zehn = unterEinkauf(artikel, 10);
  assert.equal(zehn.geprueft, 3);
  assert.deepEqual(zehn.treffer.map((t) => t.name), ["Lego"]);
  assert.equal(zehn.treffer[0].nachher, 9);
  // Spielraum: Lego 5 %, Batterie 15 %, Kabel 50 % → höchstens 5 %
  assert.equal(zehn.hoechstens, 5);

  // 20 %: Batterie 0,80 und Lego 8,00 – der größere Verlust zuerst
  assert.deepEqual(unterEinkauf(artikel, 20).treffer.map((t) => t.name), ["Lego", "Batterie"]);

  // Nur Batterien: Lego zählt nicht mehr
  const nurBatterien = unterEinkauf(artikel, 10, ["bat"]);
  assert.equal(nurBatterien.geprueft, 1);
  assert.equal(nurBatterien.treffer.length, 0);
  assert.equal(nurBatterien.hoechstens, 15);

  // Genau der Einkaufspreis ist noch keine Unterschreitung
  assert.equal(unterEinkauf(artikel, 15, ["bat"]).treffer.length, 0);
  // Verglichen wird der auf den Cent gerundete Preis, wie er auf der Rechnung
  // steht: 15,1 % ergibt 0,849 → 0,85 und liegt noch nicht darunter.
  assert.equal(unterEinkauf(artikel, 15.1, ["bat"]).treffer.length, 0);
  assert.equal(unterEinkauf(artikel, 16, ["bat"]).treffer.length, 1);
});

test("Einkaufspreis: schon ohne Gutschein unter Einkauf heißt 0 % Spielraum", () => {
  const r = unterEinkauf([{ name: "X", sku: "1", categoryId: "a", preis: 1, ek: 1.2 }], 5);
  assert.equal(r.hoechstens, 0);
  assert.equal(r.treffer.length, 1);
  assert.equal(unterEinkauf([], 50).treffer.length, 0);
});

test("Code-Normalisierung und Zufallscode", () => {
  assert.equal(normalisiereCode(" sommer 25 "), "SOMMER25");
  for (let i = 0; i < 50; i++) {
    const code = zufallsCode();
    assert.match(code, CODE_MUSTER);
    assert.doesNotMatch(code, /[01OIL]/);
  }
});

test("Kasse: Kondition nur auf Katalogartikel, netto", async () => {
  const { kassenSummen } = await import("@/lib/rabatt");
  const s = kassenSummen(
    [
      { unitPrice: 2.5, quantity: 1, katalog: true },
      { unitPrice: 1.2, quantity: 1, katalog: true },
      { unitPrice: 12.5, quantity: 2, katalog: false },
    ],
    10,
    false,
    19,
  );
  // Artikel 3,70 → 10 % = 0,37; 28,70 − 0,37 = 28,33; USt 5,38 → 33,71
  assert.deepEqual(s, { summe: 28.7, abzug: 0.37, netto: 28.33, ust: 5.38, brutto: 33.71 });
});

test("Kasse: ohne Kondition wie bisher, brutto herausgerechnet", async () => {
  const { kassenSummen } = await import("@/lib/rabatt");
  const s = kassenSummen([{ unitPrice: 11.9, quantity: 1, katalog: true }], 0, true, 19);
  assert.deepEqual(s, { summe: 11.9, abzug: 0, netto: 10, ust: 1.9, brutto: 11.9 });
});
