import { test } from "node:test";
import assert from "node:assert/strict";
import { geraeteName, istAboTot, waehleEmpfaenger, type AboZeile } from "@/lib/push-ziele";

function abo(teil: Partial<AboZeile> & { id: string }): AboZeile {
  return {
    endpoint: `https://push.example/${teil.id}`,
    p256dh: "p",
    auth: "a",
    bei_bestellung: true,
    bei_neukunde: true,
    users: { role: "admin", is_active: true },
    ...teil,
  };
}

test("Empfänger: Admin mit passendem Schalter", () => {
  const z = [abo({ id: "1" })];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung").map((a) => a.id), ["1"]);
  assert.deepEqual(waehleEmpfaenger(z, "neukunde").map((a) => a.id), ["1"]);
});

test("Empfänger: Schalter aus schließt nur diese Art aus", () => {
  const z = [abo({ id: "1", bei_bestellung: false }), abo({ id: "2", bei_neukunde: false })];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung").map((a) => a.id), ["2"]);
  assert.deepEqual(waehleEmpfaenger(z, "neukunde").map((a) => a.id), ["1"]);
});

test("Empfänger: Kunde und deaktiviertes Konto bekommen nichts", () => {
  const z = [
    abo({ id: "kunde", users: { role: "customer", is_active: true } }),
    abo({ id: "inaktiv", users: { role: "admin", is_active: false } }),
    abo({ id: "ohne", users: null }),
  ];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung"), []);
});

test("Empfänger: Besitzer darf als Liste ankommen (PostgREST-Einbettung)", () => {
  const z = [abo({ id: "1", users: [{ role: "admin", is_active: true }] })];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung").map((a) => a.id), ["1"]);
});

test("Abo tot: nur 404 und 410", () => {
  assert.equal(istAboTot(404), true);
  assert.equal(istAboTot(410), true);
  assert.equal(istAboTot(500), false);
  assert.equal(istAboTot(429), false);
  assert.equal(istAboTot(undefined), false);
});

test("Gerätename aus User-Agent", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const macSafari =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
  const macChrome =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const android =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
  const winEdge =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
  assert.equal(geraeteName(iphone), "iPhone");
  assert.equal(geraeteName(macSafari), "Mac · Safari");
  assert.equal(geraeteName(macChrome), "Mac · Chrome");
  assert.equal(geraeteName(android), "Android");
  assert.equal(geraeteName(winEdge), "Windows · Edge");
  assert.equal(geraeteName(""), "Unbekanntes Gerät");
});
