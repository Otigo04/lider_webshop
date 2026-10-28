/**
 * Einmaliger Lauf: Iden-Rechnungen 26050025082 und 26080075475 als
 * Wareneingang buchen.
 *
 *   node --import ./tests/register.mjs --experimental-strip-types \
 *     --disable-warning=ExperimentalWarning --env-file=.env.local \
 *     scripts/import-lieferung-iden-2605-2608.mjs <pdf-26050025082> <pdf-26080075475> [--probe]
 *
 * Gleicher Ablauf wie import-lieferung-iden-26080074616.mjs: PDF lesen,
 * Zeilen und Summe prüfen, über record_stock_entries() buchen.
 */
import { readFile } from "node:fs/promises";
import { adminClient } from "./admin-session.mjs";
import { leseRechnung } from "@/lib/rechnung-lesen";
import { pruefeSumme, zeileStimmt, preiseNeuerArtikel, fasseZusammen } from "@/lib/rechnung-import";

const PROBE = process.argv.includes("--probe");
const pfade = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (pfade.length !== 2) throw new Error("Aufruf: … <pdf-26050025082> <pdf-26080075475> [--probe]");

const NOTIZEN = {
  "26050025082": "Iden, Rechnung 26050025082 vom 22.10.2026",
  "26080075475": "Iden, Rechnung 26080075475 vom 22.10.2026",
};

const gruppeVon = (name) => {
  if (/squishy|antistress|dumpling/i.test(name)) return "Dumpling's & Squishy's";
  if (/leuchtmittel/i.test(name)) return "Glühbirnen";
  if (/^(LEGO|BRIO|schleich|vtech|Hot Wheels|Eisenbahn|Werkbank)/i.test(name)) return "Spielwaren";
  return "Geschenkartikel";
};

const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

const { data: einst, error: eE } = await db.from("company_settings").select("pos_vat_rate").limit(1).single();
if (eE) throw new Error(`MwSt: ${eE.message}`);
const mwst = Number(einst.pos_vat_rate);

const { data: kategorien } = await db.from("categories").select("id, name");
const gruppeId = (n) => {
  const k = kategorien.find((c) => c.name === n);
  if (!k) throw new Error(`Warengruppe "${n}" fehlt.`);
  return k.id;
};

const rechnungen = [];
for (const pfad of pfade) {
  const r = await leseRechnung(new Uint8Array(await readFile(pfad)));
  if (!NOTIZEN[r.rechnungsnummer]) throw new Error(`Unerwartete Rechnung: ${r.rechnungsnummer}`);
  const s = pruefeSumme(r);
  if (!s.ok || !r.positionen.every(zeileStimmt)) throw new Error(`${r.rechnungsnummer}: Summen/Zeilen stimmen nicht.`);
  const { data: doppelt } = await db.from("stock_entries").select("id").ilike("note", `%${r.rechnungsnummer}%`).limit(1);
  if (doppelt?.length) throw new Error(`Rechnung ${r.rechnungsnummer} ist schon gebucht.`);
  rechnungen.push(r);
}

for (const r of rechnungen) {
  const positionen = fasseZusammen(r.positionen);
  const { data: bekannt, error: sE } = await db
    .from("products")
    .select("id, name, barcode")
    .in("barcode", positionen.map((p) => p.ean));
  if (sE) throw new Error(`Abgleich: ${sE.message}`);
  const nachCode = new Map((bekannt ?? []).map((z) => [z.barcode, z]));

  const items = positionen.map((p) => {
    const t = nachCode.get(p.ean);
    const { ek, gh, eh } = preiseNeuerArtikel(p, mwst);
    return {
      product_id: t?.id ?? null,
      name: t ? "" : p.name,
      barcode: p.ean,
      category_id: t ? null : gruppeId(gruppeVon(p.name)),
      quantity: p.menge,
      unit_price: t ? null : gh,
      retail_price: t ? null : eh,
      cost_price: ek,
    };
  });
  console.log(`\n== ${r.rechnungsnummer}: ${items.length} Positionen · ${items.reduce((a, i) => a + i.quantity, 0)} Stück · ${items.filter((i) => !i.product_id).length} neu`);
  for (const i of items) {
    const name = i.name || nachCode.get(i.barcode).name;
    const grp = i.category_id ? kategorien.find((c) => c.id === i.category_id).name : "bekannt";
    console.log(` ${i.barcode} ${name.slice(0, 44).padEnd(44)} ${String(i.quantity).padStart(3)}  GH ${i.unit_price ?? "="}  EH ${i.retail_price ?? "="}  EK ${i.cost_price}  [${grp}]`);
  }
  if (PROBE) continue;
  const { data, error } = await db.rpc("record_stock_entries", { p_items: items, p_note: NOTIZEN[r.rechnungsnummer] });
  if (error) { console.error("Buchen gescheitert:", error.message); process.exit(1); }
  console.log(`Gebucht: ${data.length} Positionen, ${data.filter((z) => z.is_new_product).length} neu.`);
}
if (PROBE) console.log("\n… Probelauf, nichts gebucht.");
