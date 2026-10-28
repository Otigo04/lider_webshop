/**
 * Einmaliger Lauf: die 13 SIIPRO-Artikel (Fotos vom 28.10.2026) auf einen
 * Bestand zwischen 200 und 300 Stück bringen. Gebucht wird als Zugang über
 * record_stock_entries (Differenz zum Ist), damit das Journal stimmt.
 *
 *   node --env-file=.env.local scripts/bestand-siipro-2610.mjs          # Probelauf
 *   node --env-file=.env.local scripts/bestand-siipro-2610.mjs --apply
 */
import { adminClient } from "./admin-session.mjs";

const APPLY = process.argv.includes("--apply");
const SKUS = ["120147","120036","120029","120028","120032","120033","120035","120124","120119","120128","120118","120089","120085"];
const { db } = await adminClient();

const { data, error } = await db.from("products").select("id, sku, name, stock_available").in("sku", SKUS).order("sku");
if (error) throw new Error(error.message);

const items = [];
for (const p of data) {
  const ist = p.stock_available;
  const ziel = ist >= 200 && ist <= 300 ? ist : 200 + Math.floor(Math.random() * 101);
  console.log(`${p.sku}  ${String(ist).padStart(4)} -> ${String(ziel).padStart(3)}  ${p.name}`);
  if (ziel !== ist) items.push({ product_id: p.id, name: "", quantity: ziel - ist });
}
if (!APPLY || !items.length) { console.log(APPLY ? "Nichts zu buchen." : "Probelauf, nichts gebucht."); process.exit(0); }

const { data: z, error: e } = await db.rpc("record_stock_entries", {
  p_items: items,
  p_note: "Bestand SIIPRO-Neuaufnahme 28.10.2026",
});
if (e) { console.error("Buchen gescheitert:", e.message); process.exit(1); }
console.log(`Gebucht: ${z.length} Positionen.`);
