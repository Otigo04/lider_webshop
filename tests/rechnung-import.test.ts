import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bereinige,
  ehAusEk,
  ekProStueck,
  erwarteterBetrag,
  fasseZusammen,
  grosshandelAusEk,
  preiseNeuerArtikel,
  pruefeSumme,
  zeileStimmt,
  type Rechnung,
  type RechnungPosition,
} from "@/lib/rechnung-import";

function pos(teil: Partial<RechnungPosition>): RechnungPosition {
  return {
    ean: null,
    artikelnummer: null,
    name: "Test",
    menge: 1,
    listenpreis: 1,
    rabattProzent: 0,
    uvp: null,
    zeilenbetrag: 1,
    warengruppeId: null,
    ...teil,
  };
}

test("Einkaufspreis je Stück: Listenpreis abzüglich Rabatt, auf den Cent", () => {
  assert.equal(ekProStueck(pos({ listenpreis: 1.09, rabattProzent: 10 })), 0.98);
  assert.equal(ekProStueck(pos({ listenpreis: 2.54, rabattProzent: 10 })), 2.29);
  assert.equal(ekProStueck(pos({ listenpreis: 14.19, rabattProzent: 0 })), 14.19);
});

test("erwarteter Zeilenbetrag rechnet ohne vorheriges Runden des Stückpreises", () => {
  // 120 × 1,09 × 0,9 = 117,72 – mit gerundetem Stückpreis (0,98) wären es 117,60
  assert.equal(erwarteterBetrag(pos({ menge: 120, listenpreis: 1.09, rabattProzent: 10 })), 117.72);
});

test("Gegenprobe je Zeile: 6 Cent Toleranz, 7 nicht mehr", () => {
  const basis = { menge: 120, listenpreis: 1.09, rabattProzent: 10 };
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 117.72 })), true);
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 117.66 })), true);
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 117.65 })), false);
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 118.0 })), false);
});

test("Summenprobe: Rechnung 26040197140 (Servicegebühr abgezogen)", () => {
  const r = {
    positionen: [
      pos({ zeilenbetrag: 117.72 }),
      pos({ zeilenbetrag: 49.92 }),
      pos({ zeilenbetrag: 128.52 }),
    ],
    nettoGesamt: 300.11,
    nebenkostenNetto: 3.95,
  };
  const ergebnis = pruefeSumme(r);
  assert.equal(ergebnis.summe, 296.16);
  assert.equal(ergebnis.erwartet, 296.16);
  assert.equal(ergebnis.ok, true);
});

test("Summenprobe schlägt an, wenn eine Zeile fehlt", () => {
  const r = {
    positionen: [pos({ zeilenbetrag: 117.72 }), pos({ zeilenbetrag: 49.92 })],
    nettoGesamt: 300.11,
    nebenkostenNetto: 3.95,
  };
  assert.equal(pruefeSumme(r).ok, false);
});

test("neuer Artikel mit UVP: Laden = UVP, Großhandel = UVP netto", () => {
  const p = pos({ uvp: 23.99, listenpreis: 14.19 });
  assert.deepEqual(preiseNeuerArtikel(p, 19), { ek: 14.19, gh: 20.16, eh: 23.99 });
  assert.equal(preiseNeuerArtikel(pos({ uvp: 7.99 }), 19).gh, 6.71);
  assert.equal(preiseNeuerArtikel(pos({ uvp: 2.49 }), 19).gh, 2.09);
});

test("UVP-Regel nimmt den Steuersatz aus den Firmendaten", () => {
  assert.equal(preiseNeuerArtikel(pos({ uvp: 10.7 }), 7).gh, 10);
});

test("Großhandel ohne UVP: EK × 1,30, aufgerundet auf 10 Cent", () => {
  assert.equal(grosshandelAusEk(0.39), 0.6);
  assert.equal(grosshandelAusEk(0.5), 0.7);
  assert.equal(grosshandelAusEk(1.38), 1.8);
  // 100 × 1,3 ist in Gleitkomma 130,00000000000001 – darf nicht auf 1,40 kippen
  assert.equal(grosshandelAusEk(1.0), 1.3);
});

test("Laden ohne UVP: EK × 2, aufgerundet auf die nächste X,99 €", () => {
  assert.equal(ehAusEk(0.39), 0.99);
  assert.equal(ehAusEk(0.5), 1.99);
  assert.equal(ehAusEk(1.38), 2.99);
  assert.equal(ehAusEk(3.0), 6.99);
});

test("neuer Artikel ohne UVP (auch UVP 0) nutzt die Aufschläge", () => {
  const ohne = preiseNeuerArtikel(pos({ listenpreis: 0.39, uvp: null }), 19);
  assert.deepEqual(ohne, { ek: 0.39, gh: 0.6, eh: 0.99 });
  assert.deepEqual(preiseNeuerArtikel(pos({ listenpreis: 0.39, uvp: 0 }), 19), ohne);
});

test("gleicher Barcode zweimal heißt eine Zeile mit summierter Menge", () => {
  const liste = fasseZusammen([
    pos({ ean: "4018587753000", menge: 60, zeilenbetrag: 58.86 }),
    pos({ ean: "4018587753000", menge: 60, zeilenbetrag: 58.86 }),
  ]);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].menge, 120);
  assert.equal(liste[0].zeilenbetrag, 117.72);
});

test("Zeilen ohne Barcode und verschiedene Barcodes bleiben getrennt", () => {
  const liste = fasseZusammen([
    pos({ ean: null, name: "A" }),
    pos({ ean: null, name: "A" }),
    pos({ ean: "4018587753000" }),
    pos({ ean: "3588270022054" }),
  ]);
  assert.equal(liste.length, 4);
});

test("Bereinigen: Ziffern, Mindestlänge, ganze Mengen, Nullmengen raus", () => {
  const roh: Rechnung = {
    lieferant: " Iden ",
    rechnungsnummer: " 26040197140 ",
    datum: "06.10.2026",
    nettoGesamt: 1,
    nebenkostenNetto: 0,
    positionen: [
      pos({ ean: "0196 214 147249", name: "  Poster  ", menge: 4.0 }),
      pos({ ean: "ABC", name: "ohne Code" }),
      pos({ ean: "123", name: "zu kurz" }),
      pos({ ean: "4018587753000", name: "Menge null", menge: 0 }),
    ],
  };
  const sauber = bereinige(roh);
  assert.equal(sauber.lieferant, "Iden");
  assert.equal(sauber.rechnungsnummer, "26040197140");
  assert.equal(sauber.positionen.length, 3);
  assert.equal(sauber.positionen[0].ean, "0196214147249");
  assert.equal(sauber.positionen[0].name, "Poster");
  assert.equal(sauber.positionen[1].ean, null);
  assert.equal(sauber.positionen[2].ean, null);
});
