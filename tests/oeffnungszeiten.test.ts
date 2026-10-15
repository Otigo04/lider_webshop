import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_OEFFNUNGSZEITEN,
  formatOeffnungszeiten,
  istGeoeffnet,
  openingHoursSpecification,
  parseOeffnungszeiten,
} from "@/lib/oeffnungszeiten";

// 2026: Sommerzeit bis 25.10. (UTC+2), danach Winterzeit (UTC+1).
// 12.10. Mo, 13.10. Di, 14.10. Mi, 17.10. Sa, 04.11. Mi.

test("Vorbelegung: Mo, Mi–Fr 11:00–18:30, Di zu, Sa/So 11:00–19:00", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  assert.equal(z.length, 7);
  assert.deepEqual(z[0], { open: "11:00", close: "18:30" });
  assert.equal(z[1], null);
  assert.deepEqual(z[4], { open: "11:00", close: "18:30" });
  assert.deepEqual(z[5], { open: "11:00", close: "19:00" });
  assert.deepEqual(z[6], { open: "11:00", close: "19:00" });
});

test("Mittwoch 12:00 Berlin (Sommerzeit) ist geöffnet", () => {
  assert.equal(istGeoeffnet(new Date("2026-10-14T10:00:00Z"), STANDARD_OEFFNUNGSZEITEN), true);
});

test("Dienstag ist geschlossen", () => {
  assert.equal(istGeoeffnet(new Date("2026-10-13T10:00:00Z"), STANDARD_OEFFNUNGSZEITEN), false);
});

test("Öffnung und Schluss gelten inklusive, davor und danach nicht", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  // Montag 11:00 Berlin = 09:00Z, 10:59 = 08:59Z, 18:30 = 16:30Z, 18:31 = 16:31Z
  assert.equal(istGeoeffnet(new Date("2026-10-12T09:00:00Z"), z), true);
  assert.equal(istGeoeffnet(new Date("2026-10-12T08:59:00Z"), z), false);
  assert.equal(istGeoeffnet(new Date("2026-10-12T16:30:00Z"), z), true);
  assert.equal(istGeoeffnet(new Date("2026-10-12T16:31:00Z"), z), false);
});

test("Samstag gilt bis 19:00", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  assert.equal(istGeoeffnet(new Date("2026-10-17T16:45:00Z"), z), true); // 18:45
  assert.equal(istGeoeffnet(new Date("2026-10-17T17:01:00Z"), z), false); // 19:01
});

test("Winterzeit: Mittwoch 11:00 Berlin = 10:00Z", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  assert.equal(istGeoeffnet(new Date("2026-11-04T10:00:00Z"), z), true);
  assert.equal(istGeoeffnet(new Date("2026-11-04T09:59:00Z"), z), false);
});

test("formatOeffnungszeiten fasst gleiche Zeiten zusammen", () => {
  assert.deepEqual(formatOeffnungszeiten(STANDARD_OEFFNUNGSZEITEN), [
    "Mo, Mi–Fr 11:00–18:30 Uhr",
    "Di geschlossen",
    "Sa, So 11:00–19:00 Uhr",
  ]);
});

test("formatOeffnungszeiten: alle Tage gleich", () => {
  const z = Array.from({ length: 7 }, () => ({ open: "09:00", close: "17:00" }));
  assert.deepEqual(formatOeffnungszeiten(z), ["Mo–So 09:00–17:00 Uhr"]);
});

test("parseOeffnungszeiten fällt bei Müll auf die Vorbelegung zurück", () => {
  assert.deepEqual(parseOeffnungszeiten(null), STANDARD_OEFFNUNGSZEITEN);
  assert.deepEqual(parseOeffnungszeiten("kaputt"), STANDARD_OEFFNUNGSZEITEN);
  assert.deepEqual(parseOeffnungszeiten([1, 2, 3]), STANDARD_OEFFNUNGSZEITEN);
});

test("parseOeffnungszeiten verwirft Zeiten mit schlechtem Format oder open >= close", () => {
  const roh = [
    { open: "11:00", close: "18:30" },
    { open: "25:00", close: "18:30" },
    { open: "18:30", close: "11:00" },
    null,
    { open: "11:00", close: "18:30" },
    { open: "11:00", close: "19:00" },
    { open: "11:00", close: "19:00" },
  ];
  const z = parseOeffnungszeiten(roh);
  assert.deepEqual(z[0], { open: "11:00", close: "18:30" });
  assert.equal(z[1], null);
  assert.equal(z[2], null);
  assert.equal(z[3], null);
});

test("openingHoursSpecification: ein Eintrag je Zeitfenster, englische Tage", () => {
  const spec = openingHoursSpecification(STANDARD_OEFFNUNGSZEITEN);
  assert.equal(spec.length, 2);
  assert.deepEqual(spec[0].dayOfWeek, ["Monday", "Wednesday", "Thursday", "Friday"]);
  assert.equal(spec[0].opens, "11:00");
  assert.equal(spec[0].closes, "18:30");
  assert.deepEqual(spec[1].dayOfWeek, ["Saturday", "Sunday"]);
});

test("parseOeffnungszeiten: Rückfall liefert eine Kopie, nicht die Vorbelegung", () => {
  const kopie = parseOeffnungszeiten(null);
  kopie[0] = null;
  assert.deepEqual(STANDARD_OEFFNUNGSZEITEN[0], { open: "11:00", close: "18:30" });
});
