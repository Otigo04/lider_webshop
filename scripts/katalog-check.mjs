/**
 * Prüft die Regeln des Kataloggenerators (lib/katalog.ts) gegen feste
 * Eingaben: Umbruch, Faltung, Ausschlüsse, Preise.
 *
 * Das Projekt hat keinen Testrunner. Dieses Skript ist die Stelle, an der
 * sich nachrechnen lässt, ob die Seitenzahl in der Werkbank zum Papier passt.
 *
 *   node --experimental-strip-types scripts/katalog-check.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// „@/lib/x" kennt Node nicht – auf die Datei im Projekt umbiegen.
const wurzel = pathToFileURL(`${process.cwd()}/`).href;
register(
  `data:text/javascript,${encodeURIComponent(`
    export function resolve(spec, ctx, next) {
      if (spec.startsWith("@/")) {
        return next(${JSON.stringify(wurzel)} + spec.slice(2) + ".ts", ctx);
      }
      return next(spec, ctx);
    }
  `)}`,
);

const k = await import("../lib/katalog.ts");

let nr = 0;
/** Ein druckbarer Artikel; `mehr` überschreibt einzelne Angaben. */
function artikel(mehr = {}) {
  nr++;
  return {
    id: `a${nr}`,
    sku: String(110000 + nr),
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
const viele = (n, mehr = {}) => Array.from({ length: n }, () => artikel(mehr));
const e = (mehr = {}) => ({ ...k.KATALOG_VORGABE, ...mehr });

const pruefungen = [];
const pruefe = (name, fn) => pruefungen.push([name, fn]);

pruefe("Artikel je Seite: Liste 20, Kacheln 12, Groß 6", () => {
  for (const [layout, jeSeite] of [["liste", 20], ["kacheln", 12], ["gross", 6]]) {
    const voll = k.katalogAufbau(viele(jeSeite), e({ layout }));
    assert.equal(voll.seiten.length, 1, `${layout}: eine volle Seite`);
    const mehr = k.katalogAufbau(viele(jeSeite + 1), e({ layout }));
    assert.equal(mehr.seiten.length, 2, `${layout}: einer mehr bricht um`);
  }
});

pruefe("Kein Block ragt über die Seite oder überdeckt einen anderen", () => {
  for (const layout of ["liste", "kacheln", "gross"]) {
    for (const mitTrennseiten of [true, false]) {
      const liste = [
        ...viele(7),
        ...viele(5, { gruppeId: "g1", gruppeName: "Lampe" }),
        ...viele(4, { kategorieId: "k2", kategorie: "Spielwaren", kategorieRang: 2 }),
        ...viele(70, { kategorieId: "k3", kategorie: "Büro", kategorieRang: 3, gruppeId: "g2" }),
        ...viele(9, { kategorieId: "k3", kategorie: "Büro", kategorieRang: 3 }),
      ];
      const aufbau = k.katalogAufbau(liste, e({ layout, mitTrennseiten }));
      const raster = k.RASTER[layout];
      for (const seite of aufbau.seiten) {
        const belegt = new Set();
        for (const b of seite.bloecke) {
          assert.ok(b.zeile >= 0 && b.zeile + b.hoehe <= raster.einheiten,
            `${layout}: Block ragt über die Seite ${seite.nummer}`);
          const spalten = b.art === "artikel"
            ? [b.spalte]
            : Array.from({ length: raster.spalten }, (_, i) => i);
          for (let z = b.zeile; z < b.zeile + b.hoehe; z++) {
            for (const s of spalten) {
              assert.ok(!belegt.has(`${z}/${s}`), `${layout}: Überdeckung auf Seite ${seite.nummer}`);
              belegt.add(`${z}/${s}`);
            }
          }
        }
      }
      assert.equal(aufbau.gedruckt, liste.length, `${layout}: nichts geht verloren`);
    }
  }
});

pruefe("Warengruppe beginnt auf neuer Seite", () => {
  const liste = [
    ...viele(2),
    ...viele(2, { kategorieId: "k2", kategorie: "Spielwaren", kategorieRang: 2 }),
  ];
  const getrennt = k.katalogAufbau(liste, e());
  assert.equal(getrennt.seiten.length, 2);
  assert.equal(getrennt.seiten[1].kategorie, "Spielwaren");

  const fortlaufend = k.katalogAufbau(liste, e({ mitTrennseiten: false }));
  assert.equal(fortlaufend.seiten.length, 1);
  const kopf = fortlaufend.seiten[0].bloecke.find((b) => b.art === "ueberschrift");
  assert.equal(kopf?.kategorie, "Spielwaren");
});

pruefe("Zwischenüberschrift steht nie als Letztes auf der Seite", () => {
  for (const layout of ["liste", "kacheln", "gross"]) {
    for (let n = 1; n <= 30; n++) {
      const aufbau = k.katalogAufbau(
        [...viele(n), ...viele(3, { kategorieId: "k2", kategorie: "B", kategorieRang: 2 })],
        e({ layout, mitTrennseiten: false }),
      );
      for (const seite of aufbau.seiten) {
        const letzter = [...seite.bloecke].sort((a, b) => b.zeile - a.zeile)[0];
        assert.notEqual(letzter.art, "ueberschrift", `${layout}, ${n} Artikel`);
      }
    }
  }
});

pruefe("Reihenfolge der Warengruppen folgt dem Rang, nicht der Eingabe", () => {
  const aufbau = k.katalogAufbau(
    [
      artikel({ kategorieId: "k2", kategorie: "Zubehör", kategorieRang: 2 }),
      artikel({ kategorieId: "k1", kategorie: "Haushalt", kategorieRang: 1 }),
    ],
    e(),
  );
  assert.deepEqual(aufbau.seiten.map((s) => s.kategorie), ["Haushalt", "Zubehör"]);
});

pruefe("Ausführungen falten zu einem Angebot über die volle Breite", () => {
  const aufbau = k.katalogAufbau(
    viele(3, { gruppeId: "g1", gruppeName: "LED-Lampe" }),
    e(),
  );
  const [block] = aufbau.seiten[0].bloecke;
  assert.equal(aufbau.seiten[0].bloecke.length, 1);
  assert.equal(block.art, "angebot");
  assert.equal(block.titel, "LED-Lampe");
  assert.equal(block.ausfuehrungen.length, 3);
  assert.equal(aufbau.gedruckt, 3);
});

pruefe("Ein einzelnes Gruppenmitglied bleibt ein gewöhnlicher Artikel", () => {
  const aufbau = k.katalogAufbau([artikel({ gruppeId: "g1", gruppeName: "X" })], e());
  assert.equal(aufbau.seiten[0].bloecke[0].art, "artikel");
});

pruefe("Vor einem Angebot wird die angefangene Zeile aufgefüllt", () => {
  const aufbau = k.katalogAufbau(
    [
      artikel(),
      ...viele(2, { gruppeId: "g1", gruppeName: "Angebot" }),
      artikel(),
      artikel(),
    ],
    e({ layout: "kacheln" }),
  );
  const bloecke = aufbau.seiten[0].bloecke;
  assert.deepEqual(bloecke.map((b) => b.art), ["artikel", "artikel", "artikel", "angebot"]);
  assert.equal(bloecke[3].zeile, k.RASTER.kacheln.artikel);
});

pruefe("Ein Angebot, höher als eine Seite, wird geteilt und fortgesetzt", () => {
  const aufbau = k.katalogAufbau(viele(120, { gruppeId: "g1", gruppeName: "Riesig" }), e());
  assert.ok(aufbau.seiten.length > 1);
  const teile = aufbau.seiten.flatMap((s) => s.bloecke);
  assert.equal(teile[0].fortsetzung, false);
  assert.ok(teile.slice(1).every((t) => t.fortsetzung));
  assert.equal(teile.reduce((n, t) => n + t.ausfuehrungen.length, 0), 120);
});

pruefe("Ohne Foto fehlt der Artikel und wird gemeldet", () => {
  const ohne = artikel({ bildUrl: null });
  const aufbau = k.katalogAufbau([ohne, artikel()], e());
  assert.deepEqual(aufbau.ohneFoto, [ohne.id]);
  assert.equal(aufbau.gedruckt, 1);
});

pruefe("Im Angebot reicht ein Foto für alle Ausführungen", () => {
  const aufbau = k.katalogAufbau(
    [
      artikel({ gruppeId: "g1", bildUrl: null }),
      artikel({ gruppeId: "g1" }),
    ],
    e(),
  );
  assert.deepEqual(aufbau.ohneFoto, []);
  assert.equal(aufbau.gedruckt, 2);
});

pruefe("Preisart Laden: kein Rückfall auf die Staffel", () => {
  const ohneLaden = artikel({ laden: null });
  assert.equal(k.katalogPreis(ohneLaden, "laden"), null);
  assert.equal(k.katalogPreis(ohneLaden, "grosshandel").preis, 2);

  const aufbau = k.katalogAufbau([ohneLaden, artikel()], e({ preisart: "laden" }));
  assert.deepEqual(aufbau.ohnePreis, [ohneLaden.id]);
  assert.equal(aufbau.gedruckt, 1);
});

pruefe("Preisart Großhandel: ohne Staffel fehlt der Artikel", () => {
  const ohne = artikel({ staffeln: [] });
  const aufbau = k.katalogAufbau([ohne], e());
  assert.deepEqual(aufbau.ohnePreis, [ohne.id]);
  assert.equal(aufbau.gesamtSeiten, 0);
});

pruefe("Preisart Ohne: druckt auch Artikel ohne jeden Preis", () => {
  const aufbau = k.katalogAufbau([artikel({ staffeln: [], laden: null })], e({ preisart: "ohne" }));
  assert.equal(aufbau.gedruckt, 1);
  assert.deepEqual(aufbau.ohnePreis, []);
});

pruefe("Reduzierung: nur mit Ladenpreis, Prozent auf die Staffel übertragen", () => {
  const reduziert = artikel({ laden: 8, vorher: 10, staffeln: [{ ab: 1, preis: 4 }] });
  assert.equal(k.katalogPreis(reduziert, "laden").reduziert.prozent, 20);
  const gh = k.katalogPreis(reduziert, "grosshandel").reduziert;
  assert.equal(gh.prozent, 20);
  assert.equal(gh.vorher, 5);

  const ohneLaden = artikel({ laden: null, vorher: 10 });
  assert.equal(k.katalogPreis(ohneLaden, "grosshandel").reduziert, null);
});

pruefe("Listenstaffeln: höchstens drei, erste zwei und die letzte", () => {
  assert.deepEqual(k.listenStaffeln([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(k.listenStaffeln([1, 2, 3, 4, 5]), [1, 2, 5]);
});

pruefe("Inhaltsverzeichnis erst ab acht Seiten, Seitenzahlen stimmen", () => {
  const kurz = k.katalogAufbau(viele(12), e());
  assert.equal(kurz.inhalt, null);
  assert.equal(kurz.gesamtSeiten, 3); // Titel, eine Seite, Rückseite
  assert.equal(kurz.seiten[0].nummer, 2);

  const lang = k.katalogAufbau(
    [
      ...viele(36),
      ...viele(24, { kategorieId: "k2", kategorie: "Spielwaren", kategorieRang: 2 }),
    ],
    e(),
  );
  // Titel + Inhalt + 3 + 2 + Rückseite
  assert.equal(lang.gesamtSeiten, 8);
  assert.deepEqual(lang.inhalt, [
    { kategorie: "Haushalt", seite: 3 },
    { kategorie: "Spielwaren", seite: 6 },
  ]);
  assert.equal(lang.seiten[3].nummer, 6);
  assert.equal(lang.seiten[3].kategorie, "Spielwaren");

  const abgeschaltet = k.katalogAufbau(viele(120), e({ mitInhalt: false }));
  assert.equal(abgeschaltet.inhalt, null);
});

pruefe("Leerer Katalog hat keine Seiten", () => {
  const aufbau = k.katalogAufbau([], e());
  assert.equal(aufbau.gesamtSeiten, 0);
  assert.equal(aufbau.seiten.length, 0);
});

let fehler = 0;
for (const [name, fn] of pruefungen) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    fehler++;
    console.log(`  FEHLT ${name}\n        ${err.message}`);
  }
}
console.log(`\n${pruefungen.length - fehler} von ${pruefungen.length} bestanden`);
process.exit(fehler > 0 ? 1 : 0);
