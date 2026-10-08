/**
 * Gibt jedem Artikel ohne Foto genau ein Bild, damit er im Shop erscheint
 * (Migration 020: has_image steuert die Sichtbarkeit).
 *
 *   node --env-file=.env.local scripts/bilder-auffuellen.mjs
 *
 * Reihenfolge je Artikel:
 *   1. Produktfoto aus den offenen Datenbanken (Open Food/Beauty/Products/Pet
 *      Food Facts) über den Barcode.
 *   2. Sonst ein neutrales Platzhalterbild mit Wappen und Artikelname. Es liegt
 *      unter `platzhalter-….jpg` und ist daran erkennbar; ein zweiter Lauf mit
 *      --ersetzen versucht für solche Artikel erneut ein echtes Foto.
 *
 * Artikel, die schon ein Bild haben, bleiben unberührt. Idempotent.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "products";
const AGENT = "LiderWebshop/1.0 (Bildabgleich)";
const ERSETZEN = process.argv.includes("--ersetzen");
const MAX_BYTES = 8 * 1024 * 1024;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

const pause = (ms) => new Promise((weiter) => setTimeout(weiter, ms));

async function alle(tabelle, spalten) {
  const zeilen = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.from(tabelle).select(spalten).range(von, von + 999);
    if (error) throw new Error(`${tabelle}: ${error.message}`);
    zeilen.push(...data);
    if (data.length < 1000) break;
  }
  return zeilen;
}

async function json(url) {
  try {
    const antwort = await fetch(url, {
      headers: { "User-Agent": AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    return antwort.ok ? await antwort.json() : null;
  } catch {
    return null;
  }
}

const HOSTS = [
  "world.openfoodfacts.org",
  "world.openbeautyfacts.org",
  "world.openproductsfacts.org",
  "world.openpetfoodfacts.org",
];

function istHandelscode(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  return !code.replace(/^0+(?=\d{13}$)/, "").startsWith("2");
}

async function bildAdresse(code) {
  const treffer = await Promise.all(
    HOSTS.map((host) =>
      json(
        `https://${host}/api/v2/product/${code}.json?fields=image_front_url,image_url`,
      ),
    ),
  );
  for (const t of treffer) {
    if (t?.status !== 1) continue;
    const roh = t.product?.image_front_url ?? t.product?.image_url;
    if (typeof roh === "string" && roh.startsWith("http")) {
      return roh.replace(/^http:\/\//i, "https://");
    }
  }
  return null;
}

async function ladeRohbild(adresse) {
  try {
    const antwort = await fetch(adresse, {
      headers: { "User-Agent": AGENT, Accept: "image/*" },
      signal: AbortSignal.timeout(12000),
    });
    if (!antwort.ok) return null;
    const typ = (antwort.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!typ.startsWith("image/")) return null;
    const bytes = Buffer.from(await antwort.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** 4:3, weiß hinterlegt – wie bei den übrigen Artikelfotos. */
async function aufbereiten(rohdaten) {
  const inhalt = await sharp(rohdaten)
    .rotate()
    .resize(1000, 720, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  return sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: inhalt, gravity: "center" }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

const maskieren = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Name auf höchstens drei Zeilen à ~26 Zeichen umbrechen. */
function umbrechen(name) {
  const zeilen = [];
  let aktuell = "";
  for (const wort of name.split(/\s+/)) {
    if ((aktuell + " " + wort).trim().length > 26 && aktuell) {
      zeilen.push(aktuell);
      aktuell = wort;
    } else {
      aktuell = (aktuell + " " + wort).trim();
    }
  }
  if (aktuell) zeilen.push(aktuell);
  if (zeilen.length > 3) {
    zeilen.length = 3;
    zeilen[2] = zeilen[2].slice(0, 23) + "…";
  }
  return zeilen;
}

let wappen = null;
async function platzhalter(name) {
  wappen ??= await sharp(
    await readFile(new URL("../public/logo/logo-mark.png", import.meta.url)),
  )
    .resize(260, 260, { fit: "inside" })
    .toBuffer();

  const zeilen = umbrechen(name);
  const text = zeilen
    .map(
      (z, i) =>
        `<text x="600" y="${560 + i * 56}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="42" fill="#374151">${maskieren(z)}</text>`,
    )
    .join("");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">${text}</svg>`,
  );

  return sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#f3f4f6" },
  })
    .composite([{ input: wappen, left: 470, top: 200 }, { input: svg }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function ablegen(produkt, jpeg, vorsilbe) {
  const pfad = `${produkt.id}/${vorsilbe}${randomUUID()}.jpg`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(pfad, jpeg, { contentType: "image/jpeg" });
  if (error) throw new Error(`Upload: ${error.message}`);

  const { error: zeile } = await db
    .from("product_images")
    .insert({ product_id: produkt.id, file_path: pfad, display_order: 0 });
  if (zeile) {
    await db.storage.from(BUCKET).remove([pfad]);
    throw new Error(`Zuordnung: ${zeile.message}`);
  }
  return pfad;
}

async function main() {
  const produkte = await alle("products", "id, sku, name, barcode");
  const bilder = await alle("product_images", "id, product_id, file_path");

  const nachProdukt = new Map();
  for (const b of bilder) {
    nachProdukt.set(b.product_id, [...(nachProdukt.get(b.product_id) ?? []), b]);
  }

  const offen = produkte.filter((p) => {
    const eigene = nachProdukt.get(p.id) ?? [];
    if (eigene.length === 0) return true;
    return ERSETZEN && eigene.every((b) => b.file_path.includes("/platzhalter-"));
  });

  console.log(`${offen.length} von ${produkte.length} Artikeln brauchen ein Bild.\n`);

  let echt = 0;
  let ersatz = 0;
  let fehler = 0;
  let nr = 0;

  for (const produkt of offen) {
    nr++;
    try {
      let jpeg = null;
      const code = (produkt.barcode ?? "").trim();
      if (istHandelscode(code)) {
        const adresse = await bildAdresse(code);
        const roh = adresse ? await ladeRohbild(adresse) : null;
        if (roh) jpeg = await aufbereiten(roh).catch(() => null);
        await pause(300);
      }

      const alte = nachProdukt.get(produkt.id) ?? [];

      if (jpeg) {
        await ablegen(produkt, jpeg, "");
        echt++;
        console.log(`[${nr}/${offen.length}] Foto        ${produkt.sku}  ${produkt.name}`);
      } else if (alte.length === 0) {
        await ablegen(produkt, await platzhalter(produkt.name), "platzhalter-");
        ersatz++;
        console.log(`[${nr}/${offen.length}] Platzhalter ${produkt.sku}  ${produkt.name}`);
        continue;
      } else {
        continue; // --ersetzen, aber wieder nichts gefunden: Platzhalter bleibt
      }

      // Echtes Foto liegt – den alten Platzhalter entfernen.
      if (alte.length) {
        await db.storage.from(BUCKET).remove(alte.map((b) => b.file_path));
        await db.from("product_images").delete().in("id", alte.map((b) => b.id));
      }
    } catch (e) {
      fehler++;
      console.log(`[${nr}/${offen.length}] FEHLER      ${produkt.sku}: ${e.message}`);
    }
  }

  console.log(`\n${echt} echte Fotos, ${ersatz} Platzhalter, ${fehler} Fehler.`);
}

await main();
