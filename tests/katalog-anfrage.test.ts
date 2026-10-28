import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KATALOG_VORGABE,
  katalogAufbau,
  katalogPreis,
  type KatalogArtikel,
} from "@/lib/katalog";
import { buildKatalogHtml, type KatalogFirma } from "@/lib/katalog-bogen";

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


const FIRMA: KatalogFirma = {
  name: "LIDER",
  strasse: null,
  plzOrt: null,
  telefon: null,
  email: null,
  website: null,
  ladenpreiseBrutto: false,
};

function html(
  artikelListe: KatalogArtikel[],
  layout: "liste" | "kacheln" | "gross",
  preisart: "grosshandel" | "laden" | "ohne",
): string {
  const e = { ...KATALOG_VORGABE, layout, preisart, mitTitelseite: false, mitRueckseite: false };
  const aufbau = katalogAufbau(artikelListe, e);
  return buildKatalogHtml(aufbau, e, FIRMA, {
    logo: null,
    wappen: null,
    wortmarke: null,
    stand: new Date("2026-10-28T12:00:00Z"),
    autoPrint: false,
  });
}

test("Gedruckt steht „Preis auf Anfrage“, in allen Layouts und Preisarten außer „ohne“", () => {
  const anfrage = artikel({ aufAnfrage: true, name: "Sonderartikel" });
  for (const layout of ["liste", "kacheln", "gross"] as const) {
    for (const preisart of ["grosshandel", "laden"] as const) {
      const seite = html([anfrage, artikel()], layout, preisart);
      assert.match(seite, /Preis auf Anfrage/, `${layout}/${preisart}`);
      // Genau einmal: für den einen Artikel, nicht auch für den normalen.
      assert.equal(seite.split("Preis auf Anfrage").length - 1, 1, `${layout}/${preisart}`);
    }
    assert.doesNotMatch(html([anfrage], layout, "ohne"), /Preis auf Anfrage/, `${layout}/ohne`);
  }
});

test("Ein normaler Artikel druckt seinen Preis, nicht den Hinweis", () => {
  const seite = html([artikel({ staffeln: [{ ab: 1, preis: 2 }] })], "kacheln", "grosshandel");
  assert.doesNotMatch(seite, /Preis auf Anfrage/);
  assert.match(seite, /2,00/);
});

test("Ausführungen eines Angebots: der Hinweis ersetzt die Preiszellen der einen Zeile", () => {
  const gruppe = { gruppeId: "g1", gruppeName: "Lampe E27" };
  const liste = [
    artikel({ ...gruppe, name: "Lampe warmweiß" }),
    artikel({ ...gruppe, name: "Lampe kaltweiß", aufAnfrage: true }),
  ];
  for (const layout of ["kacheln", "liste"] as const) {
    const seite = html(liste, layout, "grosshandel");
    assert.equal(seite.split("Preis auf Anfrage").length - 1, 1, layout);
  }
});
