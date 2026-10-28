/**
 * Einmaliger Lauf: Iden-Rechnung 26080074616 als Wareneingang buchen.
 *
 *   node --import ./tests/register.mjs --experimental-strip-types \
 *     --disable-warning=ExperimentalWarning --env-file=.env.local \
 *     scripts/import-lieferung-iden-26080074616.mjs <pdf> [--probe]
 *
 * Liest das PDF mit demselben Leser wie der Dialog „Rechnung hochladen",
 * prüft Zeilen und Summe und bucht über record_stock_entries().
 * LEGO → Spielwaren, Squishy/Antistress → Dumpling's & Squishy's.
 */
import { readFile } from "node:fs/promises";
import { adminClient } from "./admin-session.mjs";
import { leseRechnung } from "@/lib/rechnung-lesen";
import { pruefeSumme, zeileStimmt, preiseNeuerArtikel, fasseZusammen } from "@/lib/rechnung-import";

const pfad = process.argv[2];
const PROBE = process.argv.includes("--probe");
if (!pfad) throw new Error("Aufruf: … <pdf> [--probe]");

const r = await leseRechnung(new Uint8Array(await readFile(pfad)));
if (r.rechnungsnummer !== "26080074616") throw new Error(`Falsche Rechnung: ${r.rechnungsnummer}`);
const s = pruefeSumme(r);
if (!s.ok || !r.positionen.every(zeileStimmt)) {
  console.error("Summen/Zeilen stimmen nicht – abgebrochen.");
  process.exit(1);
}
const NOTIZ = "Iden, Rechnung 26080074616 vom 17.10.2026";
const gruppeVon = (name) => (/^LEGO/i.test(name) ? "Spielwaren" : "Dumpling's & Squishy's");

const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

const { data: doppelt } = await db.from("stock_entries").select("id").ilike("note", "%26080074616%").limit(1);
if (doppelt?.length) throw new Error("Rechnung 26080074616 ist schon gebucht.");

const { data: einst, error: eE } = await db.from("company_settings").select("pos_vat_rate").limit(1).single();
if (eE) throw new Error(`MwSt: ${eE.message}`);
const mwst = Number(einst.pos_vat_rate);

const { data: kategorien } = await db.from("categories").select("id, name");
const gruppeId = (n) => {
  const k = kategorien.find((c) => c.name === n);
  if (!k) throw new Error(`Warengruppe "${n}" fehlt.`);
  return k.id;
};

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
console.log(`${items.length} Positionen · ${items.reduce((a, i) => a + i.quantity, 0)} Stück · ${items.filter((i) => !i.product_id).length} neu`);
for (const i of items) {
  console.log(` ${i.barcode} ${(i.name || nachCode.get(i.barcode).name).slice(0, 48).padEnd(48)} ${String(i.quantity).padStart(3)}  GH ${i.unit_price ?? "="}  EH ${i.retail_price ?? "="}  EK ${i.cost_price}${i.product_id ? "  BEKANNT" : ""}`);
}
if (PROBE) { console.log("… Probelauf, nichts gebucht."); process.exit(0); }

const { data, error } = await db.rpc("record_stock_entries", { p_items: items, p_note: NOTIZ });
if (error) { console.error("Buchen gescheitert:", error.message); process.exit(1); }
console.log(`Gebucht: ${data.length} Positionen, ${data.filter((z) => z.is_new_product).length} neu.`);
