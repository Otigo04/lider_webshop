/**
 * Einmaliger Lauf: zwölf SIIPRO-Produktfotos (Downloads/IMG_41xx) auf die
 * vorhandenen Artikel setzen. Bild wie bei bilder-zuordnen.mjs auf 4:3 mit
 * weißem Grund; Artikel mit echtem Foto bleiben unberührt, Platzhalter werden
 * ersetzt.
 *
 *   node --env-file=.env.local scripts/bilder-siipro-2610.mjs          # Trockenlauf
 *   node --env-file=.env.local scripts/bilder-siipro-2610.mjs --apply
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const ORDNER = "/Users/otigo_mac/Downloads";
const BUCKET = "products";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// Bild -> Artikelnummer(n); name nur, wo der vorhandene Name falsch/unklar ist.
const ZUORDNUNG = [
  { bild: "IMG_4145", skus: ["120147"] }, // USB-A auf Type-C 1 m 3.0A
  { bild: "IMG_4148", skus: ["120036"] }, // USB auf Lightning 1 m 3.0A
  { bild: "IMG_4149", skus: ["120029"] }, // Type-C auf Type-C 1 m 60W
  { bild: "IMG_4151", skus: ["120028"], name: "2 meter USB-Lightning Kabel (12160)" }, // 2 m 2.4A
  { bild: "IMG_4153", skus: ["120032"] }, // USB auf Type-C 2 m
  { bild: "IMG_4155", skus: ["120033"] }, // USB auf Type-C 3 m
  { bild: "IMG_4157", skus: ["120035"] }, // Type-C auf Lightning 3 m 30W
  { bild: "IMG_4159", skus: ["120124"] }, // Magnetic Car Holder
  { bild: "IMG_4162", skus: ["120119"] }, // Wireless Car Charger SW-48B
  { bild: "IMG_4166", skus: ["120128", "120118"] }, // Wireless Car Charger magnetisch (11950, zweimal angelegt)
  { bild: "IMG_4173", skus: ["120089"] }, // Car Charger SA-31 48W
  { bild: "IMG_4176", skus: ["120085"] }, // Car Charger SA-16 20W
];

async function aufbereiten(roh) {
  const inhalt = await sharp(roh).rotate().flatten({ background: "#ffffff" })
    .resize(1100, 820, { fit: "inside" }).toBuffer();
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: "#ffffff" } })
    .composite([{ input: inhalt, gravity: "center" }]).jpeg({ quality: 85 }).toBuffer();
}

let ok = 0, fehler = 0;
for (const z of ZUORDNUNG) {
  const jpeg = await aufbereiten(await readFile(`${ORDNER}/${z.bild}.JPG`));
  for (const sku of z.skus) {
    try {
      const { data: p } = await db.from("products").select("id, name").eq("sku", sku).maybeSingle();
      if (!p) throw new Error("SKU unbekannt");
      const { data: alte } = await db.from("product_images").select("id, file_path").eq("product_id", p.id);
      if (alte?.some((b) => !b.file_path.includes("/platzhalter-"))) { console.log(`= ${sku} ${p.name}: hat schon ein Foto`); continue; }
      console.log(`${APPLY ? "+" : "~"} ${z.bild} -> ${sku} ${p.name}${z.name ? `  => Name: ${z.name}` : ""}`);
      if (!APPLY) continue;

      const pfad = `${p.id}/${randomUUID()}.jpg`;
      const up = await db.storage.from(BUCKET).upload(pfad, jpeg, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const ins = await db.from("product_images").insert({ product_id: p.id, file_path: pfad, display_order: 0 });
      if (ins.error) { await db.storage.from(BUCKET).remove([pfad]); throw new Error(ins.error.message); }
      if (alte?.length) {
        await db.storage.from(BUCKET).remove(alte.map((b) => b.file_path));
        await db.from("product_images").delete().in("id", alte.map((b) => b.id));
      }
      if (z.name && z.name !== p.name) await db.from("products").update({ name: z.name }).eq("id", p.id);
      ok++;
    } catch (e) { fehler++; console.log(`! ${sku}: ${e.message}`); }
  }
}
console.log(APPLY ? `\n${ok} gesetzt, ${fehler} Fehler.` : "\nTrockenlauf. Mit --apply schreiben.");
