/**
 * Ersetzt die Platzhalterbilder der Testartikel durch echte Fotos.
 *
 *   node --env-file=.env.local scripts/testbilder-holen.mjs
 *
 * Quelle ist ausschließlich Wikimedia Commons, und übernommen wird nur, was
 * gemeinfrei ist oder unter CC0 steht – also ohne Namensnennungspflicht.
 * Herstellerfotos von Marken-Websites sind fremdes Urheberrecht und werden
 * hier bewusst nicht angefasst.
 *
 * Die Fotos sind Symbolbilder für die Warengruppe, nicht der exakte Artikel.
 * Für den Livebetrieb gehören dort Fotos vom Lieferanten oder eigene
 * Aufnahmen hin – siehe Hinweis am Ende der Ausgabe.
 *
 * Findet sich für einen Artikel kein passendes freies Foto, bleibt sein
 * Platzhalter stehen. Ein zweiter Lauf holt nur das Fehlende nach.
 */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "products";
const AGENT = "LIDER-Grosshandel-Testdaten/1.0 (Entwicklung; keine Weiterverbreitung)";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

/**
 * Suchbegriffe je Artikel. Bewusst nach Warengruppe formuliert: nach einem
 * konkreten Set zu suchen liefert entweder nichts Freies oder ein Foto, das
 * den Artikel falsch darstellt.
 */
const SUCHE = {
  "LEGO City 60420 Bagger mit Ladefläche": ["lego bricks toy", "toy excavator"],
  "LEGO Technic 42177 Kettenbagger": ["toy excavator", "lego technic"],
  "LEGO Friends 41757 Botanischer Garten": [
    "lego bricks",
    "toy building blocks",
    "plastic construction toy",
  ],
  "Bruder MAN TGS Kipplaster 03667": ["toy truck", "model dump truck toy"],
  "Bruder Fendt 1050 Vario Traktor 04040": ["toy tractor", "model tractor toy"],
  "Bruder bworld Figurenset Feuerwehr": ["toy figures", "toy firefighter"],
  "Playmobil Country 71304 Bauernhof": ["playmobil", "toy farm animals"],
  "Schleich Wild Life Löwe 14812": ["toy lion figurine", "animal figurine"],
  "Ravensburger Puzzle 1000 Teile Berlin": [
    "jigsaw puzzle",
    "puzzle pieces",
    "jigsaw",
  ],
  "Simba Sandform-Set 8-teilig": [
    "sand toys bucket",
    "beach toys",
    "sand bucket spade",
    "plastic bucket toy",
  ],
  "JBL Go 4 Bluetooth-Lautsprecher": [
    "bluetooth speaker",
    "portable speaker",
    "loudspeaker portable",
    "wireless speaker",
  ],
  "Anker Soundcore Q30 Over-Ear-Kopfhörer": [
    "headphones",
    "over-ear headphones",
    "headphone",
    "earphones",
  ],
  'Philips 24" LED-Monitor 241V8LA': [
    "computer monitor",
    "lcd monitor",
    "flat screen monitor",
    "computer display",
  ],
  "SanDisk Ultra microSDXC 128 GB": [
    "microsd card",
    "memory card",
    "sd card",
    "flash memory card",
  ],
  "Logitech M185 Funkmaus": [
    "computer mouse",
    "wireless mouse",
    "optical mouse",
    "mouse computer hardware",
  ],
  "Baseus GaN5 Pro Netzteil 65 W": [
    "usb charger",
    "power adapter usb",
    "ac adapter",
    "power supply plug",
  ],
  "Anker PowerCore 10000 Powerbank": [
    "power bank battery",
    "portable charger",
    "battery pack usb",
    "rechargeable battery pack",
  ],
  "Panzerglas iPhone 15/16 – 10er Pack": [
    "screen protector",
    "smartphone glass",
    "tempered glass sheet",
    "smartphone display",
  ],
  "Silikonhülle Samsung Galaxy A55 sortiert": [
    "phone case",
    "smartphone cover",
    "mobile phone case",
    "silicone case phone",
  ],
  "USB-C-Kabel 2 m Nylon – 25er Pack": [
    "usb cable",
    "usb-c cable",
    "usb connector cable",
    "charging cable",
  ],
};

/** Wikimedia drosselt bei schneller Folge (HTTP 429). */
const pause = (ms) => new Promise((weiter) => setTimeout(weiter, ms));

/**
 * Motive, die im Shop nichts verloren haben: Patentzeichnungen statt Fotos,
 * defekte oder verbrannte Ware, Museumsstücke. Die Commons-Suche liefert so
 * etwas bereitwillig, weil es oft gemeinfrei ist.
 */
const UNBRAUCHBAR =
  /patent|drawing|diagram|blueprint|us\d{6,}|burnt|burned|melted|broken|damaged|fire|museum|louvre|antique|vintage|tin toy|litho|excavation|archaeolog/i;

/** Ohne Namensnennungspflicht – alles andere wird übersprungen. */
function istFrei(lizenz = "") {
  const l = lizenz.toLowerCase();
  return (
    l.includes("cc0") ||
    l.includes("public domain") ||
    l === "pd" ||
    l.startsWith("pd-")
  );
}

async function commonsSuche(begriff) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
    `&gsrsearch=${encodeURIComponent("filetype:bitmap " + begriff)}` +
    "&gsrnamespace=6&gsrlimit=25&prop=imageinfo&iiprop=url|extmetadata" +
    "&iiurlwidth=1400&format=json&origin=*";

  const antwort = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!antwort.ok) return [];
  const daten = await antwort.json();

  return Object.values(daten.query?.pages ?? {})
    .map((seite) => {
      const info = seite.imageinfo?.[0];
      if (!info) return null;
      return {
        titel: seite.title,
        lizenz: info.extmetadata?.LicenseShortName?.value ?? "",
        seite: info.descriptionurl,
        // Verkleinerte Fassung zuerst; sie wird beim ersten Abruf erzeugt und
        // dabei gern gedrosselt, deshalb das Original als Rückfallebene.
        urls: [info.thumburl, info.url].filter(Boolean),
      };
    })
    .filter(
      (treffer) =>
        treffer && istFrei(treffer.lizenz) && !UNBRAUCHBAR.test(treffer.titel),
    );
}

/** Foto auf einheitliches Format bringen: 4:3, weiß hinterlegt, Rand ringsum. */
async function aufbereiten(rohdaten) {
  const inhalt = await sharp(rohdaten)
    .resize(1000, 720, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  return sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: inhalt, gravity: "center" }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_SERVICE_KEY fehlt – mit --env-file=.env.local starten.");
  }

  const { data: produkte, error } = await db
    .from("products")
    .select("id, sku, name")
    .in("name", Object.keys(SUCHE));
  if (error) throw new Error(error.message);

  // Nur Artikel anfassen, die noch am Platzhalter hängen. Die Platzhalter aus
  // seed-testartikel.mjs sind PNG, echte Fotos legt dieses Skript als JPEG ab.
  const { data: bilder } = await db.from("product_images").select("product_id, file_path");
  const hatFoto = new Set(
    (bilder ?? [])
      .filter((zeile) => zeile.file_path.endsWith(".jpg"))
      .map((zeile) => zeile.product_id),
  );
  const offen = produkte.filter((produkt) => !hatFoto.has(produkt.id));

  if (offen.length === 0) {
    console.log("Alle Testartikel haben bereits ein Foto.");
    return;
  }
  console.log(`${offen.length} Artikel ohne Foto.\n`);

  const nachweise = [];
  let ersetzt = 0;
  let uebersprungen = 0;

  for (const produkt of offen) {
    const kandidaten = [];
    for (const begriff of SUCHE[produkt.name]) {
      kandidaten.push(...(await commonsSuche(begriff)));
      await pause(400);
      if (kandidaten.length >= 4) break;
    }

    if (kandidaten.length === 0) {
      uebersprungen++;
      console.log(`  – ${produkt.sku}  ${produkt.name}: nichts Freies gefunden`);
      continue;
    }

    // Nacheinander durchprobieren: einzelne Dateien liefern dauerhaft 429.
    let treffer = null;
    let rohdaten = null;
    for (const kandidat of kandidaten.slice(0, 4)) {
      for (const url of kandidat.urls) {
        const antwort = await fetch(url, { headers: { "User-Agent": AGENT } });
        if (antwort.ok) {
          rohdaten = Buffer.from(await antwort.arrayBuffer());
          treffer = kandidat;
          break;
        }
        await pause(800);
      }
      if (rohdaten) break;
    }

    if (!rohdaten) {
      uebersprungen++;
      console.log(`  ! ${produkt.sku}: kein Download möglich – Skript nochmal starten`);
      continue;
    }

    const jpeg = await aufbereiten(rohdaten);
    const pfad = `${produkt.id}/${randomUUID()}.jpg`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(pfad, jpeg, { contentType: "image/jpeg" });
    if (uploadError) {
      uebersprungen++;
      console.log(`  ! ${produkt.sku}: Upload ${uploadError.message}`);
      continue;
    }

    // Alte Platzhalter erst entfernen, wenn das neue Bild sicher liegt.
    const { data: alte } = await db
      .from("product_images")
      .select("id, file_path")
      .eq("product_id", produkt.id);

    if (alte?.length) {
      await db.storage.from(BUCKET).remove(alte.map((zeile) => zeile.file_path));
      await db.from("product_images").delete().eq("product_id", produkt.id);
    }

    await db
      .from("product_images")
      .insert({ product_id: produkt.id, file_path: pfad, display_order: 0 });

    nachweise.push({ ...treffer, sku: produkt.sku, artikel: produkt.name });
    ersetzt++;
    console.log(`  + ${produkt.sku}  ${produkt.name}  ←  ${treffer.lizenz}`);
  }

  // Frühere Läufe haben andere Artikel versorgt – deren Nachweise bleiben.
  const datei = new URL("./testbilder-quellen.md", import.meta.url);
  const bisher = await readFile(datei, "utf8").catch(() => "");
  const alteZeilen = bisher
    .split("\n")
    .filter((zeile) => zeile.startsWith("- **"))
    .filter((zeile) => !nachweise.some((n) => zeile.startsWith(`- **${n.sku}**`)));

  const liste = [
    "# Bildnachweise der Testartikel",
    "",
    "Symbolbilder aus Wikimedia Commons, ausschließlich gemeinfrei oder CC0.",
    "Sie zeigen die Warengruppe, nicht den konkreten Artikel. Vor dem Livegang",
    "durch Fotos vom Lieferanten oder eigene Aufnahmen ersetzen.",
    "",
    ...[...alteZeilen, ...nachweise.map(alsZeile)].sort(),
  ].join("\n");

  await writeFile(datei, liste + "\n");

  console.log(
    `\n${ersetzt} Fotos gesetzt, ${uebersprungen} übersprungen.` +
      "\nNachweise in scripts/testbilder-quellen.md." +
      "\nSymbolbilder – für den Livebetrieb Lieferantenfotos verwenden.",
  );
}

function alsZeile(e) {
  return `- **${e.sku}** ${e.artikel}: ${e.titel} (${e.lizenz}) – ${e.seite}`;
}

await main();
