/**
 * Setzt für gegebene Artikel ein echtes Foto und entfernt den Platzhalter.
 *
 *   node --env-file=.env.local scripts/bilder-zuordnen.mjs zuordnung.json
 *
 * zuordnung.json: { "<SKU>": "<Bildadresse https://…>", … }
 * Das Bild wird auf 4:3 mit weißem Grund gebracht (wie bei den übrigen
 * Artikelfotos). Der alte Platzhalter wird erst entfernt, wenn das neue Bild
 * sicher liegt. Artikel, die schon ein echtes Foto haben, bleiben unberührt.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "products";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const zuordnung = JSON.parse(await readFile(process.argv[2], "utf8"));

async function laden(url) {
  const a = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36", Accept: "image/*" },
    signal: AbortSignal.timeout(15000),
  });
  if (!a.ok) throw new Error(`HTTP ${a.status}`);
  const b = Buffer.from(await a.arrayBuffer());
  if (b.length < 3000) throw new Error("Bild zu klein");
  return b;
}

async function aufbereiten(roh) {
  const inhalt = await sharp(roh).rotate().flatten({ background: "#ffffff" })
    .resize(1000, 720, { fit: "inside", withoutEnlargement: false }).toBuffer();
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: "#ffffff" } })
    .composite([{ input: inhalt, gravity: "center" }]).jpeg({ quality: 85 }).toBuffer();
}

let ok = 0, fehler = 0;
for (const [sku, url] of Object.entries(zuordnung)) {
  try {
    const { data: p } = await db.from("products").select("id, name").eq("sku", sku).maybeSingle();
    if (!p) throw new Error("SKU unbekannt");
    const { data: alte } = await db.from("product_images").select("id, file_path").eq("product_id", p.id);
    if (alte?.some((b) => !b.file_path.includes("/platzhalter-"))) { console.log(`= ${sku} hat schon ein Foto`); continue; }

    const jpeg = await aufbereiten(await laden(url));
    const pfad = `${p.id}/${randomUUID()}.jpg`;
    const up = await db.storage.from(BUCKET).upload(pfad, jpeg, { contentType: "image/jpeg" });
    if (up.error) throw new Error(up.error.message);
    const ins = await db.from("product_images").insert({ product_id: p.id, file_path: pfad, display_order: 0 });
    if (ins.error) { await db.storage.from(BUCKET).remove([pfad]); throw new Error(ins.error.message); }

    if (alte?.length) {
      await db.storage.from(BUCKET).remove(alte.map((b) => b.file_path));
      await db.from("product_images").delete().in("id", alte.map((b) => b.id));
    }
    ok++; console.log(`+ ${sku} ${p.name}`);
  } catch (e) { fehler++; console.log(`! ${sku}: ${e.message}`); }
}
console.log(`\n${ok} gesetzt, ${fehler} Fehler.`);
