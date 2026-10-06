import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Die Nummernkreise leben in der Datenbank (DEFAULT-Ausdrücke an Sequenzen).
 * Ohne Datenbank lässt sich nur prüfen, dass die Definitionen so in den
 * Migrationen stehen, wie die Doku sie beschreibt – und dass keine Migration
 * sie später unbemerkt umstellt. Wer einen Kreis ändern will, ändert hier den
 * Test mit und prüft vorher, was mit bereits vergebenen Nummern geschieht.
 */
const dir = "supabase/migrations";
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ f, text: readFileSync(`${dir}/${f}`, "utf8") }));
const schema = readFileSync("supabase/schema.sql", "utf8");

/** Letzte Zuweisung eines DEFAULT mit dem Präfix in Schema + Migrationen. */
function letzteDefinition(muster: RegExp): string | null {
  let treffer: string | null = null;
  for (const text of [schema, ...sql.map((s) => s.text)]) {
    const m = text.match(muster);
    if (m) treffer = m[0];
  }
  return treffer;
}

test("Bestellnummer: LG-JJJJ-00001", () => {
  const d = letzteDefinition(
    /'LG-'\s*\|\|\s*to_char\(now\(\), 'YYYY'\)\s*\|\|\s*'-'\s*\|\|\s*lpad\(nextval\('public\.order_number_seq'\)::TEXT, 5, '0'\)/,
  );
  assert.ok(d, "Definition der Bestellnummer nicht gefunden");
});

test("Rechnungsnummer: LD + 7 Ziffern, Zähler invoice_number_seq", () => {
  const d = letzteDefinition(
    /'LD'\s*\|\|\s*lpad\(nextval\('public\.invoice_number_seq'\)::TEXT, 7, '0'\)/,
  );
  assert.ok(d, "Definition der Rechnungsnummer nicht gefunden");
});

test("Kassenbeleg: LB + 7 Ziffern", () => {
  const d = letzteDefinition(
    /'LB'\s*\|\|\s*lpad\(nextval\('public\.pos_receipt_seq'\)::TEXT, 7, '0'\)/,
  );
  assert.ok(d, "Definition der Belegnummer nicht gefunden");
});

test("Z-Nummer: Z + 5 Ziffern", () => {
  const d = letzteDefinition(
    /'Z'\s*\|\|\s*lpad\(nextval\('public\.pos_z_seq'\)::TEXT, 5, '0'\)/,
  );
  assert.ok(d, "Definition der Z-Nummer nicht gefunden");
});

test("kein Zähler wird zurückgesetzt (Nummern müssen lückenlos weiterlaufen)", () => {
  // setval(..., 1) oder ALTER SEQUENCE ... RESTART würde vergebene Nummern
  // erneut vergeben. Ausnahme: reset_pos_day_closings() für die Z-Nummer, das
  // ist als Einrichtungsfunktion dokumentiert (Migration 026).
  const erlaubt = new Set(["026_tagesabschluss_loeschen.sql"]);
  for (const { f, text } of sql) {
    if (erlaubt.has(f)) continue;
    const code = text.replace(/--.*$/gm, "");
    assert.doesNotMatch(code, /\bRESTART\b/i, `${f}: RESTART an einer Sequenz`);
    assert.doesNotMatch(code, /setval\s*\([^)]*,\s*1\s*[,)]/i, `${f}: setval auf 1`);
  }
});
