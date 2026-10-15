import { test } from "node:test";
import assert from "node:assert/strict";
import { profilLuecken } from "@/lib/profil";

const voll = {
  full_name: "Max Muster",
  company_name: "Muster GmbH",
  billing_street: "Hauptstr. 1",
  billing_zip: "10115",
  billing_city: "Berlin",
  vat_id: "DE123456789",
};

test("vollständiges Profil hat keine Lücken", () => {
  assert.deepEqual(profilLuecken(voll), []);
});

test("fehlende und leere Angaben werden benannt", () => {
  assert.deepEqual(
    profilLuecken({ ...voll, company_name: null, billing_zip: "  ", billing_city: undefined }),
    ["Firma", "PLZ", "Ort"],
  );
});

test("ohne USt-IdNr. / Steuernummer fehlt die Pflichtangabe", () => {
  assert.deepEqual(profilLuecken({ ...voll, vat_id: null }), [
    "USt-IdNr. / Steuernummer",
  ]);
  assert.deepEqual(profilLuecken({ ...voll, vat_id: "  " }), [
    "USt-IdNr. / Steuernummer",
  ]);
});

test("ungültiges Format zählt als Lücke", () => {
  assert.deepEqual(profilLuecken({ ...voll, vat_id: "keine" }), [
    "USt-IdNr. / Steuernummer",
  ]);
});

test("ganz leeres Profil: alle sechs Pflichtangaben", () => {
  assert.equal(profilLuecken({}).length, 6);
});
