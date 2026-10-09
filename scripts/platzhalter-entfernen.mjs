/**
 * Entfernt alle Platzhalterbilder (`…/platzhalter-….jpg`) aus Datenbank und
 * Speicher.
 *
 *   node --env-file=.env.local scripts/platzhalter-entfernen.mjs --probe
 *   node --env-file=.env.local scripts/platzhalter-entfernen.mjs
 *
 * Artikel, die danach kein Bild mehr haben, verschwinden aus dem Webshop
 * (Migration 020, `has_image` folgt per Trigger der Tabelle `product_images`).
 * Kasse, Bestand und Preisschilder sind nicht betroffen. Echte Fotos bleiben:
 * angefasst wird nur, was am Dateinamen als Platzhalter erkennbar ist.
 *
 * --probe zählt nur und löscht nichts.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "products";
const PROBE = process.argv.includes("--probe");
const STAPEL = 100;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

const bilder = [];
for (let von = 0; ; von += 1000) {
  const { data, error } = await db
    .from("product_images")
    .select("id, product_id, file_path")
    .range(von, von + 999);
  if (error) throw new Error(`Bilder laden: ${error.message}`);
  bilder.push(...data);
  if (data.length < 1000) break;
}

const istPlatzhalter = (b) => b.file_path.split("/").pop().startsWith("platzhalter-");
const weg = bilder.filter(istPlatzhalter);
const bleibt = bilder.filter((b) => !istPlatzhalter(b));

const mitEchtem = new Set(bleibt.map((b) => b.product_id));
const verschwinden = new Set(weg.map((b) => b.product_id).filter((id) => !mitEchtem.has(id)));

console.log(`${bilder.length} Bilder · ${weg.length} Platzhalter · ${bleibt.length} echte`);
console.log(`${verschwinden.size} Artikel haben danach kein Bild mehr und verschwinden aus dem Shop.`);

if (PROBE) {
  console.log("… Probelauf, nichts gelöscht.");
  process.exit(0);
}

let geloescht = 0;
for (let i = 0; i < weg.length; i += STAPEL) {
  const teil = weg.slice(i, i + STAPEL);
  // Erst die Dateien, dann die Zeilen: scheitert das Löschen im Speicher,
  // bleibt die Zeile stehen und der nächste Lauf versucht es noch einmal.
  const { error: speicher } = await db.storage.from(BUCKET).remove(teil.map((b) => b.file_path));
  if (speicher) throw new Error(`Speicher: ${speicher.message}`);
  const { error } = await db.from("product_images").delete().in("id", teil.map((b) => b.id));
  if (error) throw new Error(`Zeilen: ${error.message}`);
  geloescht += teil.length;
  console.log(`  ${geloescht}/${weg.length}`);
}
console.log(`Fertig: ${geloescht} Platzhalterbilder entfernt.`);
