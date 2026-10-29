/**
 * Erzeugt die Symbole für die Admin-Web-App aus dem Wappen:
 *   app/apple-icon.png            180 × 180, weißer Grund (iOS Home-Bildschirm)
 *   public/logo/logo-mark-192.png 192 × 192, weißer Grund (Manifest)
 *
 *   node scripts/push-icons.mjs
 */
import sharp from "sharp";

const QUELLE = "public/logo/logo-mark.png";

async function symbol(groesse, ziel) {
  await sharp(QUELLE)
    .resize(groesse, groesse, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(ziel);
  console.log("geschrieben:", ziel);
}

await symbol(180, "app/apple-icon.png");
await symbol(192, "public/logo/logo-mark-192.png");
