/**
 * Einmaliger Lauf: Artikel einer Marke im Webshop ausblenden (is_active = false).
 *
 *   node --env-file=.env.local scripts/shop-marke-ausblenden.mjs lego playmobil           # Trockenlauf
 *   node --env-file=.env.local scripts/shop-marke-ausblenden.mjs lego playmobil --apply   # schreibt
 *
 * Treffer = Marke steht im Namen. Artikelstamm, Preise und Bestand bleiben.
 */
import { adminClient } from "./admin-session.mjs";

const APPLY = process.argv.includes("--apply");
const marken = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!marken.length) throw new Error("Keine Marke angegeben.");

const { db } = await adminClient();

for (const marke of marken) {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, is_active")
    .ilike("name", `%${marke}%`)
    .limit(5000);
  if (error) throw new Error(`${marke}: ${error.message}`);

  const sichtbar = data.filter((p) => p.is_active);
  console.log(`${marke}: ${data.length} Treffer, ${sichtbar.length} noch sichtbar`);
  for (const p of sichtbar.slice(0, 5)) console.log(`   ${p.sku}  ${p.name}`);

  if (APPLY && sichtbar.length) {
    const { error: e } = await db
      .from("products")
      .update({ is_active: false })
      .in("id", sichtbar.map((p) => p.id));
    if (e) throw new Error(`${marke} schreiben: ${e.message}`);
    console.log(`   -> ${sichtbar.length} ausgeblendet`);
  }
}
if (!APPLY) console.log("Trockenlauf. Mit --apply schreiben.");
