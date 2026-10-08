import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leseIdenZeilen, RechnungsFormatFehler } from "@/lib/rechnung-iden";
import { bereinige, pruefeSumme, zeileStimmt } from "@/lib/rechnung-import";

/** Zeilen wie `lib/rechnung-lesen.ts` sie aus dem PDF baut (ohne Kundenanschrift). */
function zeilen(name: string): string[] {
  return readFileSync(`tests/fixtures/${name}.txt`, "utf8").split("\n").filter(Boolean);
}

test("Rechnung 26040197140: Kopf, drei Positionen, Servicegebühr als Nebenkosten", () => {
  const r = leseIdenZeilen(zeilen("iden-26040197140"));
  assert.equal(r.lieferant, "Iden Logistikcenter GmbH");
  assert.equal(r.rechnungsnummer, "26040197140");
  assert.equal(r.datum, "06.10.2026");
  assert.equal(r.nettoGesamt, 300.11);
  assert.equal(r.nebenkostenNetto, 3.95);
  assert.equal(r.positionen.length, 3);

  const [a, b, c] = r.positionen;
  assert.equal(a.ean, "4018587753000");
  assert.equal(a.artikelnummer, "10065698");
  assert.equal(a.menge, 120);
  assert.equal(a.uvp, 2.49);
  assert.equal(a.listenpreis, 1.09);
  assert.equal(a.rabattProzent, 10);
  assert.equal(a.zeilenbetrag, 117.72);
  assert.equal(a.name, "Flutschi Ball 7cm 6fach sortiert");
  assert.equal(b.menge, 43);
  assert.equal(c.ean, "3588270013847");
});

test("Rechnung 26040197140 besteht beide Gegenproben", () => {
  const r = bereinige(leseIdenZeilen(zeilen("iden-26040197140")));
  assert.ok(r.positionen.every(zeileStimmt));
  assert.equal(pruefeSumme(r).ok, true);
});

test("Rechnung 26080071391: alle 17 Positionen über zwei Seiten, 465 Stück", () => {
  const r = bereinige(leseIdenZeilen(zeilen("iden-26080071391")));
  assert.equal(r.lieferant, "Iden System Großhandels GmbH");
  assert.equal(r.positionen.length, 17);
  assert.equal(r.positionen.reduce((s, p) => s + p.menge, 0), 465);
  assert.equal(r.nettoGesamt, 891.1);
  assert.equal(r.nebenkostenNetto, 0);
  assert.ok(r.positionen.every(zeileStimmt));
  assert.equal(pruefeSumme(r).ok, true);
});

test("Rechnung 26080071391: Zeilen ohne Rabatt und mehrzeilige Bezeichnungen", () => {
  const r = leseIdenZeilen(zeilen("iden-26080071391"));
  const [poster, sticker] = r.positionen;
  assert.equal(poster.ean, "0196214147249", "führende Null bleibt");
  assert.equal(poster.rabattProzent, 0);
  assert.equal(poster.uvp, 23.99);
  assert.equal(poster.name, "Pokémon Sammelkarten Poster-Kollektion 30 Jahre");
  assert.equal(sticker.name, "Pokémon Sammelkarten Tech-Sticker-Kollektion 30 Jahre");

  const knautsch = r.positionen.find((p) => p.ean === "4032722965691");
  assert.equal(
    knautsch?.name,
    "Knautschfigur Magic Moments Snow Friends Splashy Sparkle Schneemann pink blau gelb 3fach sortiert",
  );
});

test("Fußzeile und Seitenkopf landen nicht in der Bezeichnung", () => {
  const r = leseIdenZeilen(zeilen("iden-26080071391"));
  const letzteVorSeitenwechsel = r.positionen[13];
  assert.equal(letzteVorSeitenwechsel.name, "Squishy Jumbo Kuchenstück XXL 12x12cm");
  for (const p of r.positionen) {
    assert.doesNotMatch(p.name, /IBAN|Commerzbank|Seite|Rechnung/);
  }
});

test("fremdes Format wird abgelehnt statt geraten", () => {
  assert.throws(
    () => leseIdenZeilen(["Alpalium GmbH", "Auftragsbestätigung AU-1", "Pos Artikel Menge E-Preis"]),
    RechnungsFormatFehler,
  );
});
