/**
 * Einmaliger Lauf: handgeschriebener Lieferzettel (IMG_4077, 4 Positionen)
 * als Wareneingang buchen. Nur Menge, Bezeichnung, Einkaufspreis – Gesamtpreis
 * ignoriert. Großhandelspreis = Einkauf + Standardaufschlag (lib/aufschlag.ts),
 * Ladenpreis bleibt leer.
 *
 *   node --import ./tests/register.mjs --experimental-strip-types \
 *     --disable-warning=ExperimentalWarning --env-file=.env.local \
 *     scripts/import-lieferung-zettel-4077.mjs [--probe]
 */
import { adminClient } from "./admin-session.mjs";
import { aufschlagPreis, AUFSCHLAG_STANDARD } from "@/lib/aufschlag";

const PROBE = process.argv.includes("--probe");
const NOTIZ = "Lieferzettel 1-EM-17 SERVIS vom 22.10.2026";
const POSITIONEN = [
  { menge: 10, name: "65W Netzteil", ek: 7.0 },
  { menge: 10, name: "KFZ Ladestecker 38W Dual", ek: 3.0 },
  { menge: 3, name: "Magnet Case Für IP 14 Pro", ek: 2.5 },
  { menge: 3, name: "Magnet Case Für IP 14 Pro Max", ek: 2.5 },
];

const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

const { data: doppelt } = await db.from("stock_entries").select("id").eq("note", NOTIZ).limit(1);
if (doppelt?.length) throw new Error("Zettel ist schon gebucht.");

const { data: k, error: kE } = await db.from("categories").select("id").eq("name", "Handyzubehör").single();
if (kE) throw new Error(`Warengruppe: ${kE.message}`);

const items = POSITIONEN.map((p) => ({
  product_id: null,
  name: p.name,
  barcode: null,
  category_id: k.id,
  quantity: p.menge,
  unit_price: aufschlagPreis({ ek: p.ek, ...AUFSCHLAG_STANDARD }),
  retail_price: null,
  cost_price: p.ek,
}));
for (const i of items) console.log(` ${i.name.padEnd(32)} ${String(i.quantity).padStart(3)}  EK ${i.cost_price}  GH ${i.unit_price}`);
if (PROBE) { console.log("… Probelauf, nichts gebucht."); process.exit(0); }

const { data, error } = await db.rpc("record_stock_entries", { p_items: items, p_note: NOTIZ });
if (error) { console.error("Buchen gescheitert:", error.message); process.exit(1); }
console.log(`Gebucht: ${data.length} Positionen, ${data.filter((z) => z.is_new_product).length} neu.`);
