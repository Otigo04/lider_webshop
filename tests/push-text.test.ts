import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice } from "@/lib/format";
import { bestellungText, neukundeText, testText } from "@/lib/push-text";

test("Bestellung: Titel, Text mit Nummer, Kunde und Betrag, Ziel und Tag", () => {
  const n = bestellungText({
    id: "abc",
    orderNumber: "LG-2026-00012",
    kunde: "Müller GmbH",
    gesamt: 234.5,
  });
  assert.equal(n.title, "Neue Bestellung");
  assert.equal(n.body, `LG-2026-00012 · Müller GmbH · ${formatPrice(234.5)}`);
  assert.equal(n.url, "/admin/orders/abc");
  assert.equal(n.tag, "order-abc");
});

test("Bestellung: Betrag als Dezimal-String (PostgREST) wird deutsch formatiert", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", gesamt: "234.50" });
  assert.ok(n.body.includes("234,50"), n.body);
});

test("Bestellung: Betrag 0 wird gezeigt", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", gesamt: 0 });
  assert.ok(n.body.includes("0,00"), n.body);
});

test("Bestellung: fehlende Felder erscheinen nicht als undefined/null", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", kunde: null, gesamt: null });
  assert.equal(n.body, "LG-1");
  assert.ok(!/undefined|null/.test(n.body));
});

test("Bestellung: Kundenname wird getrimmt, Leerzeichen allein zählen als leer", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", kunde: "   " });
  assert.equal(n.body, "LG-1");
});

test("Neukunde: Firma und Ort", () => {
  const n = neukundeText({ id: "k1", firma: "Müller GmbH", name: "Anna Müller", ort: "Berlin" });
  assert.equal(n.title, "Neuer Kunde");
  assert.equal(n.body, "Müller GmbH · Berlin");
  assert.equal(n.url, "/admin/customers/k1");
  assert.equal(n.tag, "kunde-k1");
});

test("Neukunde: ohne Firma der Name, ohne Ort nur der Name", () => {
  const n = neukundeText({ id: "k1", firma: " ", name: "Anna Müller", ort: null });
  assert.equal(n.body, "Anna Müller");
});

test("Neukunde: ganz ohne Angaben ein Rückfalltext", () => {
  const n = neukundeText({ id: "k1" });
  assert.equal(n.body, "Neue Registrierung");
});

test("Test-Mitteilung zeigt auf das Konto", () => {
  const n = testText();
  assert.equal(n.title, "Test");
  assert.equal(n.url, "/account");
});
