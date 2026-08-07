/**
 * Legt Testartikel mit Preisstaffeln und Platzhalterbildern an.
 *
 *   node --env-file=.env.local scripts/seed-testartikel.mjs
 *
 * Nur für Entwicklung/Demo. Läuft mit dem Service-Key und umgeht damit RLS –
 * niemals gegen eine Produktivdatenbank ausführen.
 *
 * Idempotent über den Artikelnamen: bereits vorhandene Artikel werden
 * übersprungen, nicht doppelt angelegt.
 *
 * Die Bilder sind bewusst als Platzhalter erkennbar ("Foto folgt") und keine
 * erfundenen Produktfotos.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "products";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

// -----------------------------------------------------------------------------
// Stammdaten
// -----------------------------------------------------------------------------

const KATEGORIEN = [
  { slug: "spielwaren", name: "Spielwaren", description: "Markenspielwaren" },
  {
    slug: "multimedia",
    name: "Multimedia",
    description: "Multimedia Artikel zum Hammerpreis!",
  },
  {
    slug: "handyzubehoer",
    name: "Handyzubehör",
    description: "Hüllen, Kabel, Ladegeräte, Schutzglas",
  },
];

/**
 * stock: freier Bestand. Ein Artikel liegt bewusst unter der
 * Niedrigbestandsschwelle (50), damit sich das rote Badge testen lässt.
 */
const ARTIKEL = [
  // --- Spielwaren ---------------------------------------------------------
  {
    kat: "spielwaren",
    marke: "LEGO",
    name: "LEGO City 60420 Bagger mit Ladefläche",
    text: "Baustellen-Set mit Kettenbagger, Kipplaster und zwei Minifiguren. 633 Teile, Altersempfehlung ab 7 Jahren. Verkaufskarton mit 6 Stück.",
    tiers: [
      [6, 11, 41.9],
      [12, 47, 39.5],
      [48, null, 37.2],
    ],
    stock: 240,
    neu: true,
    top: true,
  },
  {
    kat: "spielwaren",
    marke: "LEGO",
    name: "LEGO Technic 42177 Kettenbagger",
    text: "Technic-Modell mit beweglichem Ausleger und Raupenketten. 1512 Teile, ab 11 Jahren.",
    tiers: [
      [4, 15, 96.5],
      [16, null, 91.0],
    ],
    stock: 96,
    neu: true,
  },
  {
    kat: "spielwaren",
    marke: "LEGO",
    name: "LEGO Friends 41757 Botanischer Garten",
    text: "Spielset mit Gewächshaus, Café und drei Figuren. 1072 Teile, ab 8 Jahren.",
    tiers: [
      [6, 23, 62.0],
      [24, null, 58.4],
    ],
    stock: 144,
  },
  {
    kat: "spielwaren",
    marke: "Bruder",
    name: "Bruder MAN TGS Kipplaster 03667",
    text: "Maßstab 1:16, Kippmulde manuell entriegelbar, Kunststoff für drinnen und draußen. Länge 49 cm.",
    tiers: [
      [4, 11, 28.9],
      [12, 35, 27.1],
      [36, null, 25.4],
    ],
    stock: 180,
    top: true,
  },
  {
    kat: "spielwaren",
    marke: "Bruder",
    name: "Bruder Fendt 1050 Vario Traktor 04040",
    text: "Maßstab 1:16 mit Fahrerhaus zum Öffnen, Zwillingsreifen und Anhängerkupplung.",
    tiers: [
      [4, 11, 34.5],
      [12, null, 32.2],
    ],
    stock: 120,
    top: true,
  },
  {
    kat: "spielwaren",
    marke: "Bruder",
    name: "Bruder bworld Figurenset Feuerwehr",
    text: "Vier Spielfiguren mit beweglichen Gliedern und Zubehör, passend zu allen bworld-Fahrzeugen.",
    tiers: [
      [12, 47, 8.9],
      [48, null, 7.95],
    ],
    stock: 420,
  },
  {
    kat: "spielwaren",
    marke: "Playmobil",
    name: "Playmobil Country 71304 Bauernhof",
    text: "Hofgebäude mit Stall, Tieren und drei Figuren. Ab 4 Jahren.",
    tiers: [
      [4, 15, 54.9],
      [16, null, 51.5],
    ],
    stock: 88,
    neu: true,
  },
  {
    kat: "spielwaren",
    marke: "Schleich",
    name: "Schleich Wild Life Löwe 14812",
    text: "Handbemalte Tierfigur, Höhe 5,5 cm. Displaykarton mit 12 Stück.",
    tiers: [
      [12, 59, 6.4],
      [60, null, 5.75],
    ],
    stock: 600,
    top: true,
  },
  {
    kat: "spielwaren",
    marke: "Ravensburger",
    name: "Ravensburger Puzzle 1000 Teile Berlin",
    text: "Motiv Berliner Skyline bei Nacht, Format 70 × 50 cm, Softclick-Technologie.",
    tiers: [
      [6, 29, 10.9],
      [30, null, 9.8],
    ],
    stock: 34,
  },
  {
    kat: "spielwaren",
    marke: "Simba",
    name: "Simba Sandform-Set 8-teilig",
    text: "Eimer, Schaufel, Rechen und fünf Sandformen. Saisonware Frühjahr/Sommer.",
    tiers: [
      [24, 119, 3.45],
      [120, null, 2.9],
    ],
    stock: 960,
    neu: true,
  },

  // --- Multimedia ---------------------------------------------------------
  {
    kat: "multimedia",
    marke: "JBL",
    name: "JBL Go 4 Bluetooth-Lautsprecher",
    text: "Tragbarer Lautsprecher, IP67 wasser- und staubdicht, 7 Stunden Laufzeit. Sortiert in fünf Farben.",
    tiers: [
      [10, 49, 29.9],
      [50, 199, 27.4],
      [200, null, 25.9],
    ],
    stock: 480,
    top: true,
  },
  {
    kat: "multimedia",
    marke: "Anker",
    name: "Anker Soundcore Q30 Over-Ear-Kopfhörer",
    text: "Bluetooth-Kopfhörer mit aktiver Geräuschunterdrückung, 40 Stunden Akkulaufzeit, Transporttasche im Lieferumfang.",
    tiers: [
      [6, 23, 58.9],
      [24, null, 54.5],
    ],
    stock: 156,
    neu: true,
  },
  {
    kat: "multimedia",
    marke: "Philips",
    name: 'Philips 24" LED-Monitor 241V8LA',
    text: "Full HD 1920 × 1080, 75 Hz, VA-Panel, HDMI und VGA. Palettenware.",
    tiers: [
      [4, 19, 84.0],
      [20, null, 79.5],
    ],
    stock: 62,
  },
  {
    kat: "multimedia",
    marke: "SanDisk",
    name: "SanDisk Ultra microSDXC 128 GB",
    text: "Speicherkarte Class 10, bis 140 MB/s Lesegeschwindigkeit, inklusive SD-Adapter.",
    tiers: [
      [20, 99, 11.4],
      [100, 499, 10.2],
      [500, null, 9.4],
    ],
    stock: 1200,
    top: true,
  },
  {
    kat: "multimedia",
    marke: "Logitech",
    name: "Logitech M185 Funkmaus",
    text: "Kabellose Maus mit Nano-Empfänger, 12 Monate Batterielaufzeit. Grau und Blau sortiert.",
    tiers: [
      [20, 99, 9.6],
      [100, null, 8.7],
    ],
    stock: 720,
  },

  // --- Handyzubehör -------------------------------------------------------
  {
    kat: "handyzubehoer",
    marke: "Baseus",
    name: "Baseus GaN5 Pro Netzteil 65 W",
    text: "Zwei USB-C- und ein USB-A-Anschluss, Power Delivery 3.0, klappbarer Stecker.",
    tiers: [
      [10, 49, 21.5],
      [50, 199, 19.8],
      [200, null, 18.4],
    ],
    stock: 540,
    neu: true,
    top: true,
  },
  {
    kat: "handyzubehoer",
    marke: "Anker",
    name: "Anker PowerCore 10000 Powerbank",
    text: "10.000 mAh, USB-C-Ein- und -Ausgang, 20 W Schnellladung. Displaykarton mit 10 Stück.",
    tiers: [
      [10, 49, 23.9],
      [50, null, 21.7],
    ],
    stock: 380,
    top: true,
  },
  {
    kat: "handyzubehoer",
    marke: "Displex",
    name: "Panzerglas iPhone 15/16 – 10er Pack",
    text: "Gehärtetes Schutzglas 9H, Full Cover, mit Montagerahmen. Verkaufseinheit 10 Stück.",
    tiers: [
      [10, 49, 14.9],
      [50, 249, 13.2],
      [250, null, 11.9],
    ],
    stock: 860,
    neu: true,
  },
  {
    kat: "handyzubehoer",
    marke: "Cellularline",
    name: "Silikonhülle Samsung Galaxy A55 sortiert",
    text: "Weiche Silikonhülle mit Innenfutter, sechs Farben gemischt geliefert.",
    tiers: [
      [24, 119, 3.2],
      [120, null, 2.65],
    ],
    stock: 1440,
  },
  {
    kat: "handyzubehoer",
    marke: "Baseus",
    name: "USB-C-Kabel 2 m Nylon – 25er Pack",
    text: "Ladekabel mit Nylonmantel, 60 W, geflochtene Zugentlastung. Verkaufseinheit 25 Stück.",
    tiers: [
      [4, 19, 41.0],
      [20, null, 37.5],
    ],
    stock: 300,
    top: true,
  },
];

// -----------------------------------------------------------------------------
// Platzhalterbild
// -----------------------------------------------------------------------------

const AKZENT = {
  spielwaren: "#b45309",
  multimedia: "#2563eb",
  handyzubehoer: "#059669",
};

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Bricht Text auf Zeilen mit höchstens `max` Zeichen um. */
function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > max) {
      lines.push(line.trim());
      line = word;
    } else {
      line += " " + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function platzhalter({ marke, name, sku, kat }) {
  const akzent = AKZENT[kat];
  const zeilen = wrap(name.replace(marke, "").trim(), 26).slice(0, 3);
  const text = zeilen
    .map(
      (z, i) =>
        `<text x="60" y="${330 + i * 38}" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#4b5563">${escape(z)}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675">
    <rect width="900" height="675" fill="#f3f4f6"/>
    <rect x="0" y="0" width="900" height="8" fill="${akzent}"/>
    <text x="60" y="120" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="${akzent}" letter-spacing="3">${escape(sku)}</text>
    <text x="60" y="250" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="700" fill="#111827">${escape(marke)}</text>
    ${text}
    <text x="60" y="600" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#9ca3af">Foto folgt</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// -----------------------------------------------------------------------------
// Anlegen
// -----------------------------------------------------------------------------

async function kategorieId(def) {
  const { data } = await db
    .from("categories")
    .select("id, sku_prefix")
    .eq("slug", def.slug)
    .maybeSingle();
  if (data) return data;

  const { data: neu, error } = await db
    .from("categories")
    .insert({
      slug: def.slug,
      name: def.name,
      description: def.description,
      order_index: 99,
    })
    .select("id, sku_prefix")
    .single();
  if (error) throw new Error(`Kategorie ${def.slug}: ${error.message}`);
  console.log(`  + Kategorie ${def.name} (Nummernkreis ${neu.sku_prefix})`);
  return neu;
}

/**
 * Nächste freie Artikelnummer im Nummernkreis. Bewusst nicht über die
 * next_sku()-Funktion: die verlangt einen eingeloggten Admin, der Service-Key
 * hat aber keine auth.uid().
 */
async function naechsteSku(prefix) {
  const { data } = await db
    .from("products")
    .select("sku")
    .like("sku", `${prefix}-%`)
    .order("sku", { ascending: false })
    .limit(1);
  const letzte = data?.[0]?.sku;
  const n = letzte ? Number(letzte.split("-")[1]) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

async function bildHochladen(produktId, sku, a) {
  const png = await platzhalter({ marke: a.marke, name: a.name, sku, kat: a.kat });
  const pfad = `${produktId}/${randomUUID()}.png`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(pfad, png, { contentType: "image/png" });
  if (error) {
    console.error(`  ! Bild ${sku}: ${error.message} – Skript nochmal starten`);
    return;
  }
  await db
    .from("product_images")
    .insert({ product_id: produktId, file_path: pfad, display_order: 0 });
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_SERVICE_KEY fehlt – mit --env-file=.env.local starten.");
  }

  console.log("Kategorien prüfen …");
  const kats = {};
  for (const def of KATEGORIEN) kats[def.slug] = await kategorieId(def);

  console.log(`\n${ARTIKEL.length} Artikel …`);
  let angelegt = 0;

  for (const a of ARTIKEL) {
    const { data: vorhanden } = await db
      .from("products")
      .select("id, sku")
      .eq("name", a.name)
      .maybeSingle();
    if (vorhanden) {
      // Der Bild-Upload kann einzeln scheitern (Gateway Timeout). Beim erneuten
      // Lauf nur das fehlende Bild nachreichen, nicht den ganzen Artikel.
      const { count } = await db
        .from("product_images")
        .select("id", { count: "exact", head: true })
        .eq("product_id", vorhanden.id);
      if (count) {
        console.log(`  = ${a.name} (existiert)`);
      } else {
        await bildHochladen(vorhanden.id, vorhanden.sku, a);
        console.log(`  ~ ${vorhanden.sku}  Bild nachgereicht`);
      }
      continue;
    }

    const kat = kats[a.kat];
    const sku = await naechsteSku(kat.sku_prefix);

    const { data: produkt, error } = await db
      .from("products")
      .insert({
        category_id: kat.id,
        sku,
        name: a.name,
        description: a.text,
        stock_available: a.stock,
        is_active: true,
        is_new: Boolean(a.neu),
        is_topseller: Boolean(a.top),
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  ! ${a.name}: ${error.message}`);
      continue;
    }

    const { error: tierError } = await db.from("product_variants").insert(
      a.tiers.map(([min, max, preis]) => ({
        product_id: produkt.id,
        min_quantity: min,
        max_quantity: max,
        unit_price: preis,
      })),
    );
    if (tierError) console.error(`  ! Staffeln ${sku}: ${tierError.message}`);

    await bildHochladen(produkt.id, sku, a);

    angelegt++;
    const flags = [a.neu && "Neuheit", a.top && "Topseller"].filter(Boolean);
    console.log(`  + ${sku}  ${a.name}${flags.length ? `  [${flags.join(", ")}]` : ""}`);
  }

  console.log(`\nFertig: ${angelegt} neu angelegt.`);
}

await main();
