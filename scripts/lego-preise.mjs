/**
 * Einmaliger Lauf: Großhandelspreise der LEGO-Artikel auf EK + Aufschlag setzen.
 *
 *   node --env-file=.env.local scripts/lego-preise.mjs           # Trockenlauf
 *   node --env-file=.env.local scripts/lego-preise.mjs --apply   # schreibt
 *
 * Pauschal 20 % Aufschlag auf den EK (Entscheidung des Betreibers).
 * Die Marge zur OVP netto (Ladenpreis brutto ÷ Steuer) wird nur angezeigt.
 *
 * Nur die Staffel (product_variants.unit_price). Ladenpreis und Vorher-Preis
 * bleiben. Ohne gepflegten EK oder ohne Ladenpreis: unverändert. Preise
 * können auch steigen (10 % → 20 %, Lauf vom 2026-10-12). Vor dem Schreiben landet der alte Stand als JSON in
 * scripts/_backup-lego-preise-<Zeitstempel>.json.
 */
import { writeFileSync } from "node:fs";
import { adminClient } from "./admin-session.mjs";

const APPLY = process.argv.includes("--apply");
const { db } = await adminClient();

const { data: firma } = await db
  .from("company_settings")
  .select("pos_vat_rate")
  .limit(1)
  .maybeSingle();
const mwst = Number(firma?.pos_vat_rate ?? 19);
const faktor = 1 + mwst / 100;

function aufschlag() {
  return 0.2;
}

const { data, error } = await db
  .from("products")
  .select(
    "id, sku, name, retail_price, cost:product_costs(cost_price), product_variants(id, min_quantity, unit_price)",
  )
  .ilike("name", "%lego%")
  .order("name")
  .limit(2000);
if (error) throw new Error(error.message);

const aenderungen = [];
const uebersprungen = [];

for (const p of data) {
  const ek = Number(Array.isArray(p.cost) ? p.cost[0]?.cost_price : p.cost?.cost_price);
  if (!ek) { uebersprungen.push([p.sku, p.name, "kein EK"]); continue; }
  if (p.retail_price == null) { uebersprungen.push([p.sku, p.name, "kein Ladenpreis"]); continue; }
  if (p.product_variants.length !== 1) { uebersprungen.push([p.sku, p.name, `${p.product_variants.length} Staffeln`]); continue; }

  const ovpNetto = Number(p.retail_price) / faktor;
  const marge = 1 - ek / ovpNetto;
  const satz = aufschlag();
  const neu = Math.round(ek * (1 + satz) * 100) / 100;
  const v = p.product_variants[0];
  const alt = Number(v.unit_price);
  if (neu === alt) { uebersprungen.push([p.sku, p.name, `Preis bleibt ${alt}`]); continue; }
  aenderungen.push({ variantId: v.id, sku: p.sku, name: p.name, ek, alt, neu, marge, satz });
}

const eur = (n) => n.toFixed(2).padStart(7);
for (const a of aenderungen) {
  console.log(
    `${a.sku.padEnd(8)} ${a.name.slice(0, 40).padEnd(40)} EK ${eur(a.ek)}  alt ${eur(a.alt)} → neu ${eur(a.neu)}  (Marge ${(a.marge * 100).toFixed(0)} %, +${Math.round(a.satz * 100)} %)`,
  );
}
console.log(`\nSteuersatz ${mwst} % · ${aenderungen.length} Änderungen · ${uebersprungen.length} unverändert`);
for (const [sku, name, grund] of uebersprungen) console.log(`  – ${sku} ${name.slice(0, 40)}: ${grund}`);

if (!APPLY) {
  console.log("\nTrockenlauf. Mit --apply schreiben.");
  process.exit(0);
}

const datei = new URL(`./_backup-lego-preise-${Date.now()}.json`, import.meta.url);
writeFileSync(datei, JSON.stringify(aenderungen, null, 2));
console.log(`\nBackup: ${datei.pathname}`);

let ok = 0;
for (const a of aenderungen) {
  const { error: e } = await db
    .from("product_variants")
    .update({ unit_price: a.neu })
    .eq("id", a.variantId);
  if (e) console.error(`FEHLER ${a.sku}: ${e.message}`);
  else ok++;
}
console.log(`${ok} von ${aenderungen.length} geschrieben.`);
