/**
 * Einmaliger Lauf: Iden-Rechnungen 26080067333 und 26080067334 als
 * Wareneingang buchen.
 *
 *   node --env-file=.env.local scripts/import-lieferung-iden-2608.mjs --probe
 *   node --env-file=.env.local scripts/import-lieferung-iden-2608.mjs
 *
 * Gebucht wird über record_stock_entries(), wie in import-lieferung.mjs.
 */
import { adminClient } from "./admin-session.mjs";
import { POSITIONEN, preise, NETTO_333, NETTO_334 } from "./lieferung-iden-26080067333.mjs";

const PROBE = process.argv.includes("--probe");
const NOTIZ = "Iden, Rechnungen 26080067333 und 26080067334 vom 22.09.2026";

// --- Gegenprobe gegen die Rechnungssummen ---------------------------------------
const summe = (liste) => liste.reduce((s, p) => s + p.betrag, 0);
const rund = (x) => Math.round(x * 100) / 100;
const erste = POSITIONEN.findIndex((p) => p.ean === "4064997501649");
const s333 = rund(summe(POSITIONEN.slice(0, erste)));
const s334 = rund(summe(POSITIONEN.slice(erste)));
console.log(`Netto 333: ${s333} (Rechnung ${rund(NETTO_333)}) · 334: ${s334} (Rechnung ${rund(NETTO_334)})`);
let abweichung = false;
for (const p of POSITIONEN) {
  const ek = p.vk * (1 - p.rabatt) * p.menge;
  if (Math.abs(ek - p.betrag) > 0.06) {
    console.log(` ZEILE PASST NICHT: ${p.ean} ${p.name}: gerechnet ${rund(ek)}, Rechnung ${p.betrag}`);
    abweichung = true;
  }
}
if (s333 !== rund(NETTO_333) || s334 !== rund(NETTO_334) || abweichung) {
  console.error("Summen stimmen nicht – abgebrochen.");
  process.exit(1);
}

const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

const { data: kategorien, error: katFehler } = await db.from("categories").select("id, name");
if (katFehler) throw new Error(`Warengruppen laden: ${katFehler.message}`);
const gruppeId = (name) => {
  const k = kategorien.find((c) => c.name === name);
  if (!k) throw new Error(`Warengruppe "${name}" gibt es nicht.`);
  return k.id;
};

const codes = POSITIONEN.map((p) => p.ean);
const { data: bekannt, error: sucheFehler } = await db
  .from("products")
  .select("id, sku, name, barcode, stock_available")
  .in("barcode", codes);
if (sucheFehler) throw new Error(`Abgleich: ${sucheFehler.message}`);
const nachBarcode = new Map((bekannt ?? []).map((z) => [z.barcode, z]));

const items = POSITIONEN.map((p) => {
  const treffer = nachBarcode.get(p.ean);
  const { ek, eh, gh } = preise(p);
  return {
    product_id: treffer?.id ?? null,
    name: treffer ? "" : p.name,
    barcode: p.ean,
    category_id: treffer ? null : gruppeId(p.gruppe),
    quantity: p.menge,
    unit_price: gh,
    retail_price: eh,
    cost_price: ek,
  };
});

const neu = items.filter((i) => i.product_id === null).length;
const stueck = items.reduce((s, i) => s + i.quantity, 0);
console.log(`${items.length} Positionen · ${stueck} Stück · ${neu} neu · ${items.length - neu} Zugang`);

if (PROBE) {
  for (const i of items) {
    console.log(
      ` ${i.barcode} ${(i.name || nachBarcode.get(i.barcode)?.name || "").slice(0, 46).padEnd(46)} ` +
        `${String(i.quantity).padStart(3)}  GH ${i.unit_price}  EH ${i.retail_price}  EK ${i.cost_price}${i.product_id ? "  [BEKANNT]" : ""}`,
    );
  }
  console.log("… Probelauf, nichts gebucht.");
  process.exit(0);
}

const { data, error } = await db.rpc("record_stock_entries", { p_items: items, p_note: NOTIZ });
if (error) {
  console.error("Buchen gescheitert:", error.message);
  process.exit(1);
}
const gebucht = data ?? [];
console.log(`Gebucht: ${gebucht.length} Positionen, davon ${gebucht.filter((z) => z.is_new_product).length} neu angelegt.`);
