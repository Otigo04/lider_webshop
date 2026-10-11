import { test } from "node:test";
import assert from "node:assert/strict";
import { bildVorbereiten } from "@/lib/bild-verkleinern";

// Ohne Browser (kein createImageBitmap/Canvas) muss der Upload mit dem
// Original weitergehen: eine Verkleinerung darf nie am Hochladen hindern.
test("ohne Browser-API kommt die Originaldatei unverändert zurück", async () => {
  const datei = new File([new Uint8Array(1000)], "foto.jpg", { type: "image/jpeg" });
  const ergebnis = await bildVorbereiten(datei, "jpg");
  assert.equal(ergebnis.blob, datei);
  assert.equal(ergebnis.contentType, "image/jpeg");
  assert.equal(ergebnis.endung, "jpg");
});

test("AVIF wird nie neu kodiert", async () => {
  const datei = new File([new Uint8Array(10)], "foto.avif", { type: "image/avif" });
  const ergebnis = await bildVorbereiten(datei, "avif");
  assert.equal(ergebnis.blob, datei);
  assert.equal(ergebnis.endung, "avif");
});
