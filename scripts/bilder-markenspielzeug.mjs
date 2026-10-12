/**
 * Produktbilder für Artikel ohne Foto in der Warengruppe Spielwaren.
 *
 *   node --env-file=.env.local scripts/bilder-markenspielzeug.mjs suchen [Ordner]
 *   node --env-file=.env.local scripts/bilder-markenspielzeug.mjs hochladen [Ordner]
 *
 * Zwei Schritte, damit nichts ungesehen im Shop landet:
 *
 *   suchen     Je Artikel mit gültigem Barcode (EAN) über die Websuche Seiten
 *              finden, die den Barcode im Text führen, und deren Produktbild
 *              (og:image / JSON-LD) laden. Angenommen wird nur ein Bild mit
 *              mindestens 500 px und weißem Rand (Produktfoto auf Weiß). Es
 *              wird nichts in die Datenbank geschrieben; Kandidaten und ihre
 *              Herkunft liegen im Ordner (kandidaten.json).
 *
 *   hochladen  Lädt die im Ordner liegenden Bilder (<sku>.jpg), die in
 *              kandidaten.json nicht auf "verworfen" stehen, als erstes Foto
 *              der Artikel hoch. Artikel mit vorhandenem Foto bleiben
 *              unberührt.
 *
 * Bild und Seite müssen zum Barcode passen: die Seite muss ihn im Quelltext
 * enthalten. Das ersetzt keine Sichtprüfung – deshalb die zwei Schritte.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "products";
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const modus = process.argv[2];
const ordner = process.argv[3] ?? "/tmp/bilder-markenspielzeug";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seiten, die für Bilder nichts taugen (Suchmaschinen, Marktplätze mit Wasserzeichen). */
const SPERRE = /(duckduckgo|bing\.com|google\.|facebook|pinterest|youtube|ebay\.|kleinanzeigen|amazon\.|idealo\.de\/preisvergleich\/Offers|instagram|tiktok)/i;

async function text(url, ms = 12000) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": BROWSER, "Accept-Language": "de-DE,de;q=0.9" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function bytes(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": BROWSER, Accept: "image/*" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const typ = (r.headers.get("content-type") ?? "").split(";")[0];
    if (!typ.startsWith("image/") || typ.includes("svg")) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 5_000 && b.length < 12 * 1024 * 1024 ? b : null;
  } catch {
    return null;
  }
}

/**
 * Websuche über Brave Search: DuckDuckGo blockt Skripte, und Bing liefert für
 * Zahlenfolgen fachfremde Treffer. Gesucht wird die nackte EAN; ob eine Seite
 * wirklich dazu passt, entscheidet erst die Prüfung, dass sie die EAN im
 * Quelltext führt.
 */
async function suchSeiten(ean) {
  // Brave begrenzt die Abfragerate (429). Bei Sperre warten und noch einmal.
  let html = null;
  for (let versuch = 0; versuch < 4 && !html; versuch++) {
    try {
      const r = await fetch(
        `https://search.brave.com/search?q=${encodeURIComponent(ean)}&source=web`,
        {
          headers: { "User-Agent": BROWSER, "Accept-Language": "de-DE,de;q=0.9" },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (r.status === 429) {
        await pause(45000 * (versuch + 1));
        continue;
      }
      if (r.ok) html = await r.text();
      else break;
    } catch {
      break;
    }
  }
  if (!html) return [];
  const seiten = [];
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (/brave\.com|bravesoftware|cdn\.|\.(png|jpe?g|webp|svg|css|js)(\?|$)/i.test(url)) continue;
    if (SPERRE.test(url)) continue;
    if (!seiten.includes(url)) seiten.push(url);
  }
  return seiten.slice(0, 8);
}

function bildAdressen(html, basis) {
  const roh = new Set();
  for (const m of html.matchAll(
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/gi,
  )) roh.add(m[1]);
  for (const m of html.matchAll(
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/gi,
  )) roh.add(m[1]);
  for (const m of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
    for (const u of m[1].matchAll(/"(https?:[^"]+)"/g)) roh.add(u[1].replace(/\\\//g, "/"));
  }
  const fertig = [];
  for (const u of roh) {
    try {
      fertig.push(new URL(u.replace(/&amp;/g, "&"), basis).toString());
    } catch {
      /* ungültige Adresse */
    }
  }
  return fertig.filter((u) => !/logo|placeholder|sprite|icon|avatar/i.test(u));
}

/** Weißer Rand: Anteil heller Pixel auf einem Ring von 4 % der Kantenlänge. */
async function weissAnteil(buf) {
  const { data, info } = await sharp(buf)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .resize(200, 200, { fit: "fill" })
    .raw()
    .toBuffer({ resolution: undefined, resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ring = Math.max(2, Math.round(w * 0.04));
  let hell = 0;
  let summe = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      const i = (y * w + x) * 3;
      summe++;
      if (data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235) hell++;
    }
  }
  return hell / summe;
}

async function kandidat(ean, vorgegeben = null) {
  const seiten = vorgegeben ?? (await suchSeiten(ean));
  for (const seite of seiten) {
    const html = await text(seite);
    if (!html || !html.includes(ean)) continue;
    const adressen = bildAdressen(html, seite).slice(0, 6);
    let bester = null;
    for (const adresse of adressen) {
      const buf = await bytes(adresse);
      if (!buf) continue;
      let meta;
      try {
        meta = await sharp(buf).metadata();
      } catch {
        continue;
      }
      const lang = Math.max(meta.width ?? 0, meta.height ?? 0);
      const kurz = Math.min(meta.width ?? 0, meta.height ?? 0);
      if (lang < 500 || kurz < 300) continue;
      const weiss = await weissAnteil(buf);
      if (weiss < 0.9) continue;
      const flaeche = (meta.width ?? 0) * (meta.height ?? 0);
      if (!bester || flaeche > bester.flaeche) {
        bester = { buf, adresse, seite, weiss, flaeche, breite: meta.width, hoehe: meta.height };
      }
    }
    if (bester) return bester;
    await pause(300);
  }
  return null;
}

/** 4:3 auf Weiß wie bei den übrigen Fotos (siehe bilder-auffuellen.mjs). */
async function aufbereiten(buf) {
  const inhalt = await sharp(buf)
    .flatten({ background: "#ffffff" })
    .rotate()
    .resize(1000, 720, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
  return sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: inhalt, gravity: "center" }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function offeneArtikel() {
  const { data: kat } = await db.from("categories").select("id").eq("name", "Spielwaren").single();
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, barcode")
    .eq("category_id", kat.id)
    .eq("is_active", true)
    .eq("has_image", false)
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Herstellerquellen mit planbarer Adresse, vor der allgemeinen Suche:
 *   LEGO (EAN 5702…)       Brickset findet den Satz über die EAN, das Bild liegt
 *                          unter images.brickset.com/sets/large/<Satz>-1.jpg
 *   Playmobil (EAN 4008789…) Satznummer steht in der EAN (Stellen 8–12); das
 *                          Verpackungsbild unter media.playmobil.com.
 */
async function herstellerBild(ean) {
  const kopf = { "User-Agent": BROWSER };
  let satz = null;
  let adresse = null;
  let seite = null;

  if (ean.startsWith("5702")) {
    const html = await text(`https://brickset.com/sets?query=${ean}`);
    const treffer = html?.match(/href="\/sets\/(\d{3,6})-1\//);
    if (!treffer) return null;
    satz = treffer[1];
    adresse = `https://images.brickset.com/sets/large/${satz}-1.jpg`;
    seite = `https://brickset.com/sets/${satz}-1`;
  } else if (ean.startsWith("4008789") && ean.length === 13) {
    satz = ean.slice(7, 12);
    adresse = `https://media.playmobil.com/i/playmobil/${satz}_product_box_front?w=1200&fmt=png-alpha`;
    seite = `https://www.playmobil.com/de-de/p/${satz}`;
  } else {
    return null;
  }

  const buf = await bytes(adresse);
  if (!buf) return null;
  const meta = await sharp(buf).metadata();
  const weiss = await weissAnteil(buf);
  // Brickset-Fotos stoßen mit Figuren und Zubehör an den Rand (Weißanteil ~0,7);
  // das Verpackungsbild von Playmobil kommt freigestellt und wird weiß hinterlegt.
  if (Math.max(meta.width ?? 0, meta.height ?? 0) < 500 || weiss < 0.6) return null;
  void kopf;
  return { buf, adresse, seite, weiss, breite: meta.width, hoehe: meta.height, satz };
}

async function suchen(seitenDatei = null) {
  await mkdir(ordner, { recursive: true });
  // "hersteller": nur die Herstellerquellen (LEGO, Playmobil), keine Websuche.
  const nurHersteller = seitenDatei === "hersteller";
  const vorgaben =
    seitenDatei && !nurHersteller
      ? JSON.parse(await readFile(seitenDatei, "utf8"))
      : null;
  let artikel = await offeneArtikel();
  if (vorgaben) artikel = artikel.filter((p) => vorgaben[p.sku]);
  console.log(`${artikel.length} Spielwaren ohne Bild.`);
  const protokoll = {};
  let treffer = 0;

  for (const [i, p] of artikel.entries()) {
    const ean = (p.barcode ?? "").trim();
    if (!/^\d{8}$|^\d{12,14}$/.test(ean) || /^0+$/.test(ean)) {
      console.log(`[${i + 1}/${artikel.length}] ${p.sku} kein gültiger Barcode  ${p.name}`);
      protokoll[p.sku] = { name: p.name, ean, status: "kein-barcode" };
      continue;
    }
    const k =
      (await herstellerBild(ean)) ??
      (nurHersteller ? null : await kandidat(ean, vorgaben?.[p.sku] ?? null));
    if (!vorgaben && !nurHersteller) await pause(6000);
    if (nurHersteller) await pause(2500);
    if (!k) {
      console.log(`[${i + 1}/${artikel.length}] ${p.sku} nichts gefunden       ${p.name}`);
      protokoll[p.sku] = { name: p.name, ean, status: "nichts" };
      continue;
    }
    const jpeg = await aufbereiten(k.buf);
    await writeFile(join(ordner, `${p.sku}.jpg`), jpeg);
    treffer++;
    protokoll[p.sku] = {
      name: p.name,
      ean,
      status: "kandidat",
      quelle: k.seite,
      bild: k.adresse,
      groesse: `${k.breite}x${k.hoehe}`,
      weiss: Number(k.weiss.toFixed(2)),
    };
    console.log(`[${i + 1}/${artikel.length}] ${p.sku} Bild ${k.breite}x${k.hoehe}  ${p.name}`);
    await pause(400);
  }
  const datei = join(ordner, "kandidaten.json");
  let alt = {};
  try { alt = JSON.parse(await readFile(datei, "utf8")); } catch {}
  await writeFile(datei, JSON.stringify({ ...alt, ...Object.fromEntries(Object.entries(protokoll).filter(([, v]) => v.status === "kandidat" || !alt[Object.keys(protokoll).find((k) => protokoll[k] === v)]) ) }, null, 2));
  console.log(`\n${treffer} Kandidaten in ${ordner}`);
}

async function hochladen() {
  const protokoll = JSON.parse(await readFile(join(ordner, "kandidaten.json"), "utf8"));
  const dateien = (await readdir(ordner)).filter((f) => f.endsWith(".jpg"));
  let ok = 0;
  for (const datei of dateien) {
    const sku = datei.replace(/\.jpg$/, "");
    if (protokoll[sku]?.status === "verworfen") continue;
    const { data: p } = await db
      .from("products")
      .select("id, name, has_image")
      .eq("sku", sku)
      .maybeSingle();
    if (!p || p.has_image) {
      console.log(`übersprungen ${sku} (${p ? "hat schon ein Bild" : "unbekannt"})`);
      continue;
    }
    const pfad = `${p.id}/${randomUUID()}.jpg`;
    const jpeg = await readFile(join(ordner, datei));
    const { error } = await db.storage
      .from(BUCKET)
      .upload(pfad, jpeg, { contentType: "image/jpeg" });
    if (error) {
      console.log(`FEHLER Upload ${sku}: ${error.message}`);
      continue;
    }
    const { error: zeile } = await db
      .from("product_images")
      .insert({ product_id: p.id, file_path: pfad, display_order: 0 });
    if (zeile) {
      await db.storage.from(BUCKET).remove([pfad]);
      console.log(`FEHLER Zuordnung ${sku}: ${zeile.message}`);
      continue;
    }
    ok++;
    console.log(`hochgeladen ${sku}  ${p.name}`);
  }
  console.log(`\n${ok} Bilder hochgeladen.`);
}

if (modus === "suchen") await suchen(process.argv[4] ?? null);
else if (modus === "hochladen") await hochladen();
else console.log("Aufruf: bilder-markenspielzeug.mjs suchen|hochladen [Ordner]");
