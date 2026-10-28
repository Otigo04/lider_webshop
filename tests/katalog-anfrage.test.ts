import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KATALOG_VORGABE,
  katalogAufbau,
  katalogPreis,
  type KatalogArtikel,
} from "@/lib/katalog";

let nr = 0;
function artikel(mehr: Partial<KatalogArtikel> = {}): KatalogArtikel {
  nr++;
  return {
    id: `a${nr}`,
    sku: String(120000 + nr),
    name: `Artikel ${nr}`,
    beschreibung: null,
    barcode: null,
    kategorieId: "k1",
    kategorie: "Haushalt",
    kategorieSlug: "haushalt",
    kategorieRang: 1,
    gruppeId: null,
    gruppeName: null,
    staffeln: [{ ab: 1, preis: 2 }],
    laden: 3.99,
    vorher: null,
    bestand: 10,
    aktiv: true,
    neu: false,
    topseller: false,
    bildUrl: "https://example.test/bild.jpg",
    merkmale: [],
    ...mehr,
  };
}

test("Preis auf Anfrage: in keiner Preisart ein Preis", () => {
  const a = artikel({ aufAnfrage: true, vorher: 9.99 });
  assert.equal(katalogPreis(a, "grosshandel"), null);
  assert.equal(katalogPreis(a, "laden"), null);
  assert.equal(katalogPreis(a, "ohne"), null);
  assert.notEqual(katalogPreis(artikel(), "grosshandel"), null);
});

test("Preis auf Anfrage bleibt im Katalog und gilt nicht als „ohne Preis“", () => {
  const anfrage = artikel({ aufAnfrage: true });
  const normal = artikel();
  for (const preisart of ["grosshandel", "laden", "ohne"] as const) {
    const aufbau = katalogAufbau([anfrage, normal], { ...KATALOG_VORGABE, preisart });
    assert.equal(aufbau.gedruckt, 2, `${preisart}: beide gedruckt`);
    assert.deepEqual(aufbau.ohnePreis, [], `${preisart}: keine Preiswarnung`);
  }
});

test("Ohne Preis und ohne Flag fehlt der Artikel weiter, mit Warnung", () => {
  const ohne = artikel({ staffeln: [], laden: null });
  const aufbau = katalogAufbau([ohne], { ...KATALOG_VORGABE, preisart: "grosshandel" });
  assert.deepEqual(aufbau.ohnePreis, [ohne.id]);
  assert.equal(aufbau.gedruckt, 0);
});
