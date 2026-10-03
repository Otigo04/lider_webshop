/**
 * Einmaliger Lauf: Lieferung Iden 26040187878 als Wareneingang buchen.
 *
 *   node --env-file=.env.local scripts/import-lieferung.mjs --probe
 *   node --env-file=.env.local scripts/import-lieferung.mjs
 *
 * Gebucht wird über record_stock_entries() – dieselbe Funktion, die auch der
 * Wareneingang in der Verwaltung ruft. Kein zweiter Weg in die Datenbank:
 * Bestand, Preisstaffel, Einkaufspreis und Journalzeile entstehen genau so,
 * wie sie beim Klick in der Oberfläche entstünden.
 *
 * --probe zeigt nur, was passieren würde.
 */
import { adminClient } from "./admin-session.mjs";
import { POSITIONEN, preise } from "./lieferung-iden-26040187878.mjs";

const PROBE = process.argv.includes("--probe");
const WARENGRUPPE = "Spielwaren";
const NOTIZ = "Iden Logistikcenter, Rechnung 26040187878 vom 22.09.2026";

const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

// --- Warengruppe -------------------------------------------------------------

const { data: kategorien, error: katFehler } = await db
  .from("categories")
  .select("id, name")
  .eq("name", WARENGRUPPE)
  .limit(1);

if (katFehler) throw new Error(`Warengruppe laden: ${katFehler.message}`);
const kategorie = kategorien?.[0];
if (!kategorie) throw new Error(`Warengruppe "${WARENGRUPPE}" gibt es nicht.`);

// --- Abgleich ----------------------------------------------------------------
// Bekannter Barcode heißt Zugang, unbekannter Neuanlage. Genau die
// Unterscheidung, die der Sammelimport in der Oberfläche trifft.

const codes = POSITIONEN.map((position) => position.ean);
const { data: bekannt, error: sucheFehler } = await db
  .from("products")
  .select("id, sku, name, barcode, stock_available")
  .in("barcode", codes);

if (sucheFehler) throw new Error(`Abgleich: ${sucheFehler.message}`);

const nachBarcode = new Map((bekannt ?? []).map((zeile) => [zeile.barcode, zeile]));

const items = POSITIONEN.map((position) => {
  const treffer = nachBarcode.get(position.ean);
  const { ek, eh, gh } = preise(position);
  return {
    product_id: treffer?.id ?? null,
    name: treffer ? "" : position.name,
    barcode: position.ean,
    category_id: treffer ? null : kategorie.id,
    quantity: position.menge,
    unit_price: gh,
    retail_price: eh,
    cost_price: ek,
  };
});

const neu = items.filter((item) => item.product_id === null).length;
const zugang = items.length - neu;
const stueck = items.reduce((summe, item) => summe + item.quantity, 0);

console.log(
  `${items.length} Positionen · ${stueck} Stück · ${neu} neu · ${zugang} Zugang`,
);

if (PROBE) {
  for (const item of items.slice(0, 5)) {
    console.log(
      ` ${item.barcode} ${(item.name || nachBarcode.get(item.barcode)?.name || "").slice(0, 44).padEnd(44)} ` +
        `${String(item.quantity).padStart(3)} Stk  GH ${item.unit_price}  EH ${item.retail_price}  EK ${item.cost_price}`,
    );
  }
  console.log("… Probelauf, nichts gebucht.");
  process.exit(0);
}

// --- Buchen ------------------------------------------------------------------

const { data, error } = await db.rpc("record_stock_entries", {
  p_items: items,
  p_note: NOTIZ,
});

if (error) {
  console.error("Buchen gescheitert:", error.message);
  process.exit(1);
}

const gebucht = data ?? [];
const angelegt = gebucht.filter((zeile) => zeile.is_new_product);

console.log(`Gebucht: ${gebucht.length} Positionen, davon ${angelegt.length} neu angelegt.`);
for (const zeile of angelegt.slice(0, 10)) {
  console.log(` ${zeile.product_sku}  ${zeile.product_name}`);
}
if (angelegt.length > 10) console.log(` … und ${angelegt.length - 10} weitere`);
