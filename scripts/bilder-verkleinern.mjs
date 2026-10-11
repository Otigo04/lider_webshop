/**
 * Verkleinert die Produktfotos im Bucket `products`, die größer sind als nötig.
 *
 *   node --env-file=.env.local scripts/bilder-verkleinern.mjs            # Trockenlauf
 *   node --env-file=.env.local scripts/bilder-verkleinern.mjs --ausfuehren
 *
 * Warum: Jede Kachel läuft über den Bildoptimierer von Next, der das Original
 * von Supabase holen muss. Originale mit 3 MB führten bei vielen gleichzeitigen
 * Kacheln zu Zeitüberschreitungen und kaputten Bildern.
 *
 * Regeln:
 *   - längere Kante höchstens 1600 px, JPEG q82 (mozjpeg), PNG/WebP gleiches
 *     Format; Pfad, Dateiendung und Datenbankzeilen bleiben unverändert
 *   - Dateien ≤ 350 KB und ≤ 1600 px bleiben unberührt
 *   - ist das Ergebnis nicht kleiner, bleibt das Original
 *   - vor dem Überschreiben liegt das Original in ./backup-produktbilder/
 *
 * Idempotent: ein zweiter Lauf findet nichts mehr.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "products";
const MAX_KANTE = 1600;
const BEHALTEN_BIS = 350 * 1024;
const AUSFUEHREN = process.argv.includes("--ausfuehren");
const SICHERUNG = "backup-produktbilder";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

async function pfade(prefix = "") {
  const ergebnis = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset: von });
    if (error) throw new Error(error.message);
    for (const o of data) {
      if (o.id === null) ergebnis.push(...(await pfade(`${prefix}${o.name}/`)));
      else ergebnis.push({ pfad: prefix + o.name, groesse: o.metadata?.size ?? 0 });
    }
    if (data.length < 1000) break;
  }
  return ergebnis;
}

const mb = (n) => (n / 1e6).toFixed(2);
let vorher = 0;
let nachher = 0;
let geaendert = 0;
let uebersprungen = 0;

for (const { pfad, groesse } of await pfade()) {
  const { data: blob, error } = await db.storage.from(BUCKET).download(pfad);
  if (error) {
    console.error(`! ${pfad}: ${error.message}`);
    continue;
  }
  const original = Buffer.from(await blob.arrayBuffer());
  const bild = sharp(original, { failOn: "none" }).rotate();
  const meta = await sharp(original).metadata();
  const kante = Math.max(meta.width ?? 0, meta.height ?? 0);

  if (kante <= MAX_KANTE && groesse <= BEHALTEN_BIS) {
    uebersprungen++;
    continue;
  }

  const format = meta.format;
  let neu = bild.resize({ width: MAX_KANTE, height: MAX_KANTE, fit: "inside", withoutEnlargement: true });
  if (format === "png") neu = neu.png({ compressionLevel: 9, palette: false });
  else if (format === "webp") neu = neu.webp({ quality: 82 });
  else neu = neu.jpeg({ quality: 82, mozjpeg: true });
  const ergebnis = await neu.toBuffer();

  if (ergebnis.length >= original.length) {
    uebersprungen++;
    continue;
  }

  vorher += original.length;
  nachher += ergebnis.length;
  geaendert++;
  console.log(`${AUSFUEHREN ? "→" : "·"} ${pfad}  ${mb(original.length)} MB → ${mb(ergebnis.length)} MB`);

  if (!AUSFUEHREN) continue;

  const ziel = join(SICHERUNG, pfad);
  await mkdir(dirname(ziel), { recursive: true });
  await writeFile(ziel, original);

  const { error: upErr } = await db.storage.from(BUCKET).upload(pfad, ergebnis, {
    upsert: true,
    contentType: blob.type || `image/${format === "jpeg" ? "jpeg" : format}`,
  });
  if (upErr) console.error(`! ${pfad}: ${upErr.message}`);
}

console.log(
  `\n${AUSFUEHREN ? "Verkleinert" : "Würde verkleinern"}: ${geaendert} Dateien, ${mb(vorher)} MB → ${mb(nachher)} MB; unberührt: ${uebersprungen}`,
);
if (!AUSFUEHREN && geaendert > 0) console.log("Mit --ausfuehren anwenden.");
