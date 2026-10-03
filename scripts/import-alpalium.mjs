/**
 * Einmaliger Lauf: Lieferung Alpalium (AU-202609-14157 + -14163) buchen.
 *
 *   node --env-file=.env.local scripts/import-alpalium.mjs --probe
 *   node --env-file=.env.local scripts/import-alpalium.mjs
 *
 * Legt zuerst die Warengruppe "Batterien" an (falls noch nicht vorhanden),
 * bucht dann über record_stock_entries() – dieselbe Funktion, die auch der
 * Wareneingang in der Verwaltung ruft.
 */
import { adminClient } from "./admin-session.mjs";
import { BATTERIEN, ELEKTRO, preise } from "./lieferung-alpalium.mjs";

const PROBE = process.argv.includes("--probe");
const NOTIZ = "Alpalium GmbH, Aufträge AU-202609-14157 und AU-202609-14163";

const { db, admin } = await adminClient();
console.log(`Angemeldet als ${admin.full_name || admin.email}`);

// --- Warengruppe "Batterien" ---------------------------------------------

let { data: batterienKat } = await db
  .from("categories")
  .select("id, sku_prefix")
  .eq("slug", "batterien")
  .maybeSingle();

if (!batterienKat) {
  if (PROBE) {
    console.log('Warengruppe "Batterien" existiert noch nicht – würde mit Prefix 15 angelegt.');
    batterienKat = { id: "probe", sku_prefix: "15" };
  } else {
    const { data, error } = await db
      .from("categories")
      .insert({
        name: "Batterien",
        slug: "batterien",
        description: "Knopfzellen, Alkaline- und Akku-Batterien",
        order_index: 5,
        sku_prefix: "15",
      })
      .select("id, sku_prefix")
      .single();
    if (error) throw new Error(`Warengruppe anlegen: ${error.message}`);
    batterienKat = data;
    console.log(`Warengruppe "Batterien" angelegt (Prefix ${data.sku_prefix}).`);
  }
} else {
  console.log(`Warengruppe "Batterien" existiert bereits (Prefix ${batterienKat.sku_prefix}).`);
}

const { data: elektroKat, error: elektroFehler } = await db
  .from("categories")
  .select("id")
  .eq("slug", "elektronik-zubehoer")
  .single();
if (elektroFehler) throw new Error(`Warengruppe Elektronik-Zubehör: ${elektroFehler.message}`);

// --- Items zusammenstellen -------------------------------------------------

function zuItems(liste, categoryId) {
  // Die Alpalium-Artikelnummer (erstes Feld) ist kein EAN und wird nicht
  // mitgeführt – ohne gescannten Barcode sucht man diese Artikel über Namen
  // oder die hier neu vergebene SKU, nicht über die Nummer des Lieferanten.
  return liste.map(([, name, menge, ek]) => {
    const { gh, eh } = preise(ek);
    return {
      product_id: null,
      name,
      barcode: null,
      category_id: categoryId,
      quantity: menge,
      unit_price: gh,
      retail_price: eh,
      cost_price: ek,
    };
  });
}

const items = [
  ...zuItems(BATTERIEN, batterienKat.id),
  ...zuItems(ELEKTRO, elektroKat.id),
];

const stueck = items.reduce((s, i) => s + i.quantity, 0);
console.log(`${items.length} Positionen · ${stueck} Stück (Verkaufseinheiten)`);

if (PROBE) {
  for (const item of items.slice(0, 6)) {
    console.log(
      ` ${item.name.padEnd(46)} ${String(item.quantity).padStart(4)} Stk  ` +
        `EK ${item.cost_price.toFixed(2)}  GH ${item.unit_price.toFixed(2)}  EH ${item.retail_price.toFixed(2)}`,
    );
  }
  console.log("… Probelauf, nichts gebucht.");
  process.exit(0);
}

const { data, error } = await db.rpc("record_stock_entries", {
  p_items: items,
  p_note: NOTIZ,
});

if (error) {
  console.error("Buchen gescheitert:", error.message);
  process.exit(1);
}

const gebucht = data ?? [];
const angelegt = gebucht.filter((z) => z.is_new_product);
console.log(`Gebucht: ${gebucht.length} Positionen, davon ${angelegt.length} neu angelegt.`);
for (const z of angelegt.slice(0, 10)) console.log(` ${z.product_sku}  ${z.product_name}`);
if (angelegt.length > 10) console.log(` … und ${angelegt.length - 10} weitere`);
