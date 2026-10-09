import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ersterBildPfad,
  naechsteReihenfolge,
  pruefeBildpfade,
} from "@/lib/artikel-bilder";

const ID = "6f1c2f9e-1a7b-4c1e-9d55-0a1b2c3d4e5f";

test("Neue Fotos kommen hinter die vorhandenen", () => {
  assert.deepEqual(naechsteReihenfolge([], 2), [0, 1]);
  assert.deepEqual(naechsteReihenfolge([0, 1, 2], 2), [3, 4]);
  // Lücken (gelöschtes Foto) werden nicht aufgefüllt, nur überholt.
  assert.deepEqual(naechsteReihenfolge([0, 5], 1), [6]);
});

test("Das erste Foto ist das mit der kleinsten Reihenfolge", () => {
  assert.equal(ersterBildPfad([]), null);
  assert.equal(ersterBildPfad(undefined), null);
  assert.equal(
    ersterBildPfad([
      { file_path: "b", display_order: 2 },
      { file_path: "a", display_order: 0 },
    ]),
    "a",
  );
});

test("Bildpfade müssen im Ordner des Artikels liegen", () => {
  assert.equal(pruefeBildpfade(ID, [`${ID}/x.jpg`, `${ID}/y.webp`]), true);
  assert.equal(pruefeBildpfade(ID, []), false);
  assert.equal(pruefeBildpfade(ID, [`andere/x.jpg`]), false);
  assert.equal(pruefeBildpfade(ID, [`${ID}/../fremd/x.jpg`]), false);
  assert.equal(pruefeBildpfade(ID, [`${ID}/`]), false);
});
