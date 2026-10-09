import { test } from "node:test";
import assert from "node:assert/strict";
import { profilLuecken } from "@/lib/profil";

const voll = {
  full_name: "Max Muster",
  company_name: "Muster GmbH",
  billing_street: "Hauptstr. 1",
  billing_zip: "10115",
  billing_city: "Berlin",
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

test("ganz leeres Profil: alle fünf Pflichtangaben", () => {
  assert.equal(profilLuecken({}).length, 5);
});
