import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLE_AUSFUEHRUNGEN,
  STANDARD_FILTER,
  abfrageSort,
  baueArtikelQuery,
  filtereArtikel,
  grundpreis,
  leseArtikelFilter,
  sortiereArtikel,
  zaehleKategorien,
} from "@/lib/admin-product-filter";
import type { AdminProductRow } from "@/lib/queries/admin";

function row(o: {
  name: string;
  sku?: string;
  kat?: string;
  gruppe?: string;
  preise?: [number, number][];
  bestand?: number;
  reserviert?: number;
}): AdminProductRow {
  return {
    id: o.name,
    name: o.name,
    sku: o.sku ?? o.name,
    category_id: o.kat ?? "k0",
    category: { id: o.kat ?? "k0", name: o.kat ?? "k0" },
    group_id: o.gruppe ?? null,
    group: o.gruppe ? { id: o.gruppe, name: o.gruppe } : null,
    variants: (o.preise ?? []).map(([min, preis], i) => ({
      id: `v${i}`,
      min_quantity: min,
      max_quantity: null,
      unit_price: preis,
    })),
    stock_available: o.bestand ?? 0,
    stock_reserved: o.reserviert ?? 0,
  } as unknown as AdminProductRow;
}

function alsParams(query: string) {
  const r: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const alt = r[k];
    r[k] = alt === undefined ? v : Array.isArray(alt) ? [...alt, v] : [alt, v];
  }
  return r;
}

const namen = (l: AdminProductRow[]) => l.map((p) => p.name);

test("ohne Parameter gilt der Standard, und der steht nicht in der Adresse", () => {
  assert.deepEqual(leseArtikelFilter({}), STANDARD_FILTER);
  assert.equal(baueArtikelQuery(STANDARD_FILTER), "");
});

test("Unbekanntes wird verworfen: Sortierung, Lagerfilter, Zahlen", () => {
  const f = leseArtikelFilter({
    sort: "quatsch",
    lager: ["knapp", "gibtsnicht"],
    preis_von: "abc",
    bestand_bis: " ",
  });
  assert.equal(f.sort, "name");
  assert.deepEqual(f.lager, ["knapp"]);
  assert.equal(f.preisVon, null);
  assert.equal(f.bestandBis, null);
});

test("Dezimalkomma wird gelesen", () => {
  assert.equal(leseArtikelFilter({ preis_von: "1,5" }).preisVon, 1.5);
});

test("Filter überleben die Rundreise Bauen → Lesen", () => {
  const f = {
    ...STANDARD_FILTER,
    q: "ball rot",
    ohneBild: true,
    flags: ["is_new", "abc"],
    lager: ["knapp" as const],
    kat: ["a", "b"],
    gruppe: [ALLE_AUSFUEHRUNGEN],
    preisVon: 1.5,
    bestandBis: 20,
    sort: "kategorie" as const,
  };
  assert.deepEqual(leseArtikelFilter(alsParams(baueArtikelQuery(f))), f);
});

test("abfrageSort: nur Datum geht in die Abfrage, alles andere bleibt Name", () => {
  assert.equal(abfrageSort("neu"), "neu");
  assert.equal(abfrageSort("alt"), "alt");
  assert.equal(abfrageSort("kategorie"), "name");
  assert.equal(abfrageSort("preis-auf"), "name");
});

test("Grundpreis ist der Preis der Staffel mit der kleinsten Mindestmenge", () => {
  assert.equal(grundpreis(row({ name: "x", preise: [[50, 1], [10, 2]] })), 2);
  assert.equal(grundpreis(row({ name: "x" })), null);
});

test("Kategorie- und Artikelgruppenfilter: ODER innerhalb, UND untereinander", () => {
  const liste = [
    row({ name: "a", kat: "k1", gruppe: "g1" }),
    row({ name: "b", kat: "k2" }),
    row({ name: "c", kat: "k1" }),
  ];
  assert.deepEqual(
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, kat: ["k1", "k2"] })),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, kat: ["k1"], gruppe: ["g1"] })),
    ["a"],
  );
  assert.deepEqual(
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, gruppe: [ALLE_AUSFUEHRUNGEN] })),
    ["a"],
  );
});

test("Preisbereich: Grenzen zählen mit, ohne Staffel fällt heraus, von > bis ist leer", () => {
  const liste = [
    row({ name: "billig", preise: [[1, 0.5]] }),
    row({ name: "mittel", preise: [[1, 1.5]] }),
    row({ name: "teuer", preise: [[1, 3]] }),
    row({ name: "ohne" }),
  ];
  const mit = (preisVon: number | null, preisBis: number | null) =>
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, preisVon, preisBis }));
  assert.deepEqual(mit(0.5, 1.5), ["billig", "mittel"]);
  assert.deepEqual(mit(2, null), ["teuer"]);
  assert.deepEqual(mit(null, 1), ["billig"]);
  assert.deepEqual(mit(3, 1), []);
  assert.deepEqual(mit(null, null), ["billig", "mittel", "teuer", "ohne"]);
});

test("Bestandsbereich rechnet mit dem freien Bestand", () => {
  const liste = [
    row({ name: "a", bestand: 10, reserviert: 4 }),
    row({ name: "b", bestand: 5 }),
    row({ name: "c", bestand: 0 }),
  ];
  const mit = (bestandVon: number | null, bestandBis: number | null) =>
    namen(filtereArtikel(liste, { ...STANDARD_FILTER, bestandVon, bestandBis }));
  assert.deepEqual(mit(6, null), ["a"]);
  assert.deepEqual(mit(null, 5), ["b", "c"]);
  assert.deepEqual(mit(0, 0), ["c"]);
});

test("Sortierung nach Warengruppe: Gruppe, dann Name", () => {
  const liste = [
    row({ name: "Zange", kat: "Werkzeug" }),
    row({ name: "Ball", kat: "Spielzeug" }),
    row({ name: "Auto", kat: "Spielzeug" }),
  ];
  assert.deepEqual(namen(sortiereArtikel(liste, "kategorie")), ["Auto", "Ball", "Zange"]);
});

test("Sortierung nach Preis: ohne Preis immer am Ende", () => {
  const liste = [
    row({ name: "ohne" }),
    row({ name: "teuer", preise: [[1, 3]] }),
    row({ name: "billig", preise: [[1, 1]] }),
  ];
  assert.deepEqual(namen(sortiereArtikel(liste, "preis-auf")), ["billig", "teuer", "ohne"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "preis-ab")), ["teuer", "billig", "ohne"]);
});

test("Sortierung nach Bestand, Artikelnummer und Name Z–A", () => {
  const liste = [
    row({ name: "a", sku: "300", bestand: 10, reserviert: 8 }),
    row({ name: "b", sku: "20", bestand: 5 }),
  ];
  assert.deepEqual(namen(sortiereArtikel(liste, "bestand-auf")), ["a", "b"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "bestand-ab")), ["b", "a"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "sku")), ["b", "a"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "name-z")), ["b", "a"]);
});

test("Datumssortierung und Name lässt die Reihenfolge der Abfrage stehen", () => {
  const liste = [row({ name: "b" }), row({ name: "a" })];
  assert.deepEqual(namen(sortiereArtikel(liste, "neu")), ["b", "a"]);
  assert.deepEqual(namen(sortiereArtikel(liste, "name")), ["b", "a"]);
});

test("Warengruppen werden gezählt", () => {
  const z = zaehleKategorien([
    row({ name: "a", kat: "k1" }),
    row({ name: "b", kat: "k1" }),
    row({ name: "c", kat: "k2" }),
  ]);
  assert.equal(z.get("k1"), 2);
  assert.equal(z.get("k2"), 1);
});
