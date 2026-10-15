import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeSteuernummer } from "@/lib/steuernummer";

test("deutsche USt-IdNr.", () => {
  assert.deepEqual(pruefeSteuernummer("DE123456789"), {
    ok: true,
    art: "ustid",
    wert: "DE123456789",
  });
});

test("USt-IdNr. mit Leerzeichen und Kleinbuchstaben wird normalisiert", () => {
  const r = pruefeSteuernummer(" de 123 456 789 ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.wert, "DE123456789");
});

test("deutsche USt-IdNr. mit falscher Länge wird abgewiesen", () => {
  assert.equal(pruefeSteuernummer("DE12345678").ok, false);
  assert.equal(pruefeSteuernummer("DE1234567890").ok, false);
});

test("EU-USt-IdNr. anderer Länder", () => {
  assert.equal(pruefeSteuernummer("ATU12345678").ok, true);
  assert.equal(pruefeSteuernummer("NL123456789B01").ok, true);
  assert.equal(pruefeSteuernummer("FR12345678901").ok, true);
});

test("deutsche Steuernummer mit und ohne Schrägstriche", () => {
  const a = pruefeSteuernummer("30/123/45678");
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.art, "steuernr");
  assert.equal(pruefeSteuernummer("3012345678").ok, true);
  assert.equal(pruefeSteuernummer("12345678901").ok, true);
  assert.equal(pruefeSteuernummer("1234567890123").ok, true);
});

test("zu kurze oder zu lange Ziffernfolgen sind keine Steuernummer", () => {
  assert.equal(pruefeSteuernummer("123456789").ok, false);
  assert.equal(pruefeSteuernummer("12345678901234").ok, false);
});

test("leer und Text", () => {
  const leer = pruefeSteuernummer("   ");
  assert.equal(leer.ok, false);
  if (!leer.ok) assert.match(leer.grund, /fehlt/);
  assert.equal(pruefeSteuernummer("keine").ok, false);
});
