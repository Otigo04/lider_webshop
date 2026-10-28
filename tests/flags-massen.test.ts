import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aenderungAusWahl,
  aenderungText,
  hatAenderung,
  produktSpalten,
} from "@/lib/flags-massen";

test("Nur gewählte Flags werden geändert, der Rest bleibt unberührt", () => {
  const a = aenderungAusWahl({ is_new: "an", is_topseller: "aus", is_preorder: "" }, { x: "an", y: "" }, "");
  assert.deepEqual(a, { fest: { is_new: true, is_topseller: false }, eigene: { x: true } });
  assert.deepEqual(produktSpalten(a), { spalten: { is_new: true, is_topseller: false } });
});

test("Nichts gewählt heißt keine Änderung", () => {
  assert.equal(hatAenderung(aenderungAusWahl({}, { x: "" }, "")), false);
  assert.equal(hatAenderung(aenderungAusWahl({}, {}, "loeschen")), true);
  assert.equal(hatAenderung(aenderungAusWahl({ is_new: "an" }, {}, "")), true);
});

test("Güteklasse setzt das Restposten-Flag mit", () => {
  const a = aenderungAusWahl({}, {}, "B");
  assert.deepEqual(produktSpalten(a), { spalten: { restposten_ware: "B", is_restposten: true } });
});

test("Restposten entfernen löscht die Güteklasse mit", () => {
  const a = aenderungAusWahl({ is_restposten: "aus" }, {}, "");
  assert.deepEqual(produktSpalten(a), { spalten: { is_restposten: false, restposten_ware: null } });
});

test("Güteklasse löschen lässt das Restposten-Flag stehen", () => {
  const a = aenderungAusWahl({}, {}, "loeschen");
  assert.deepEqual(produktSpalten(a), { spalten: { restposten_ware: null } });
});

test("Restposten entfernen und Klasse setzen widerspricht sich", () => {
  const a = aenderungAusWahl({ is_restposten: "aus" }, {}, "A");
  assert.ok("fehler" in produktSpalten(a));
});

test("Text der Änderung für die Meldung", () => {
  const a = aenderungAusWahl({ is_new: "an", is_topseller: "aus" }, { x: "an" }, "A");
  assert.equal(
    aenderungText(a, { x: "Messe" }),
    "Neuheit setzen, Topseller entfernen, Messe setzen, Güteklasse A-Ware",
  );
});
