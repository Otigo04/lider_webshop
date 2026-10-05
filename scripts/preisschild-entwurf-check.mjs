// Prüft die Obergrenze des freien Schilderstapels.
// Aufruf: node --experimental-strip-types scripts/preisschild-entwurf-check.mjs
import assert from "node:assert/strict";
import { MAX_SCHILDER, begrenze } from "../lib/preisschild-entwurf.ts";

const schild = (id, anzahl) => ({
  id, name: id, preis: 1, vorher: 0, gh: 0, sku: "", barcode: "",
  iconId: null, labelKey: null, anzahl, productId: null,
});
const summe = (l) => l.reduce((s, e) => s + e.anzahl, 0);

// Der Fall aus dem Laden: ein Barcode landete im Mengenfeld.
const vergiftet = [schild("a", 1), schild("b", 186837), schild("c", 1)];
const heil = begrenze(vergiftet);
assert.ok(summe(heil) <= MAX_SCHILDER, `Summe ${summe(heil)} > ${MAX_SCHILDER}`);
assert.equal(heil.length, 3, "Einträge bleiben erhalten");
assert.ok(heil.every((e) => e.anzahl >= 1), "jeder Eintrag mindestens 1");
assert.equal(heil[0].anzahl, 1);
assert.equal(heil[2].anzahl, 1);

// Unauffälliges bleibt unverändert (und dieselbe Referenz, kein Neuzeichnen).
const ok = [schild("a", 3), schild("b", 20)];
assert.equal(begrenze(ok), ok);

// Müll in der Menge.
const muell = begrenze([schild("a", NaN), schild("b", -4), schild("c", 2.6)]);
assert.deepEqual(muell.map((e) => e.anzahl), [1, 1, 3]);

console.log("ok");
