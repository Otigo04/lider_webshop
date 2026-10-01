import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/constants";

/**
 * Artikeldaten zu einem Barcode aus öffentlichen Produktdatenbanken.
 *
 * Wer vor der Eröffnung ein ganzes Sortiment aufnimmt, tippt sonst zu jedem
 * Etikett die Bezeichnung ab, die der Hersteller längst irgendwo hinterlegt
 * hat. Hier wird sie nachgeschlagen; am Wareneingang bleibt der Preis.
 *
 * Nur freie Quellen, kein Schlüssel, kein Vertrag. Mehrere, weil keine alles
 * kennt: die Open-Facts-Datenbanken sind stark bei Lebensmitteln, Drogerie
 * und Tierbedarf, der freie Zugang von UPCitemdb kennt mehr Haushalts- und
 * Spielwaren. Gefragt werden alle zugleich – nacheinander
 * hieße, am Scanner auf die Summe der Antwortzeiten zu warten statt auf die
 * längste.
 *
 * Kein Treffer ist der Normalfall bei Importware ohne Markennamen und kein
 * Fehler: die Zeile bleibt dann, wie sie vorher war, zum Eintippen offen.
 */

export interface EanTreffer {
  /** Vorschlag für die Bezeichnung, schon mit Marke und Füllmenge */
  name: string;
  /** Adresse des Produktfotos bei der Quelle; null = keins gefunden */
  bildUrl: string | null;
  /** Woher die Bezeichnung stammt – steht an der Zeile, damit man weiß, wem man glaubt */
  quelle: string;
}

interface Teil {
  name: string | null;
  bildUrl: string | null;
  quelle: string;
}

/** Länger wartet am Scanner niemand; danach wird eben getippt. */
const ZEITLIMIT_MS = 4500;

const KENNUNG = "LiderWebshop/1.0 (Wareneingang)";

/**
 * Gedächtnis für die Dauer des Prozesses. Derselbe Code wird zweimal gefragt:
 * beim Scan für die Bezeichnung und nach dem Buchen für das Bild. Auch
 * Fehlschläge werden gemerkt – ein unbekannter Code bleibt in den nächsten
 * Minuten unbekannt, und UPCitemdb zählt jede Anfrage.
 */
const gedaechtnis = new Map<string, { treffer: EanTreffer | null; bis: number }>();
const MERKEN_MS = 30 * 60 * 1000;

/** Nur was ein EAN/UPC/GTIN sein kann, geht nach draußen. */
export function istHandelscode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  // Präfix 2 ist der Bereich für hauseigene Nummern: jeder Laden vergibt sie
  // selbst, dieselbe Nummer ist anderswo ein anderer Artikel. Ein Treffer
  // dort wäre Zufall – im Test kam bulgarische Frischmilch zurück.
  return !code.replace(/^0+(?=\d{13}$)/, "").startsWith("2");
}

/**
 * Bezeichnung in einer Schrift, die im Laden niemand liest (kyrillisch,
 * arabisch, chinesisch …). Die offenen Datenbanken führen den Namen in der
 * Sprache dessen, der ihn eingetragen hat; so einer hilft am Regal nicht.
 */
function fremdeSchrift(name: string): boolean {
  return /[^\u0000-ɏ -⃏℀-⅏]/.test(name);
}

async function holeJson(url: string) {
  const antwort = await fetch(url, {
    headers: { "User-Agent": KENNUNG, Accept: "application/json" },
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
    cache: "no-store",
  });
  if (!antwort.ok) return null;
  return (await antwort.json()) as unknown;
}

function text(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const sauber = wert.replace(/\s+/g, " ").trim();
  return sauber === "" ? null : sauber;
}

function httpsAdresse(wert: unknown): string | null {
  const roh = text(wert);
  if (!roh) return null;
  try {
    const url = new URL(roh.replace(/^http:\/\//i, "https://"));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Marke voranstellen, wenn sie nicht schon in der Bezeichnung steckt. */
function mitMarke(name: string, marke: string | null, menge: string | null): string {
  let ergebnis = name;
  // Open Facts führt mehrere Marken kommagetrennt – die erste ist die des Etiketts.
  const ersteMarke = marke?.split(",")[0]?.trim();
  if (ersteMarke && !ergebnis.toLowerCase().includes(ersteMarke.toLowerCase())) {
    ergebnis = `${ersteMarke} ${ergebnis}`;
  }
  // „400 g e": das angehängte e ist das EWG-Schätzzeichen von der Packung,
  // in einer Bezeichnung liest es sich wie ein Tippfehler.
  const fuellmenge = menge?.replace(/\s*[e℮]$/i, "").trim();
  if (fuellmenge && !ergebnis.toLowerCase().includes(fuellmenge.toLowerCase())) {
    ergebnis = `${ergebnis} ${fuellmenge}`;
  }
  return ergebnis.slice(0, 200);
}

/** Open Food/Beauty/Products/Pet Food Facts – vier Datenbanken, eine Schnittstelle. */
async function openFacts(host: string, quelle: string, code: string): Promise<Teil | null> {
  const daten = (await holeJson(
    `https://${host}/api/v2/product/${code}.json?fields=product_name,product_name_de,generic_name_de,brands,quantity,image_front_url,image_url`,
  )) as { status?: number; product?: Record<string, unknown> } | null;

  if (!daten || daten.status !== 1 || !daten.product) return null;
  const p = daten.product;

  const name =
    text(p.product_name_de) ?? text(p.product_name) ?? text(p.generic_name_de);
  const bildUrl = httpsAdresse(p.image_front_url) ?? httpsAdresse(p.image_url);
  if (!name && !bildUrl) return null;

  return {
    name: name ? mitMarke(name, text(p.brands), text(p.quantity)) : null,
    bildUrl,
    quelle,
  };
}

/**
 * UPCitemdb, freier Zugang: 100 Abfragen je Tag und Absenderadresse. Ist das
 * Kontingent verbraucht, antwortet die Quelle mit einem Fehler und fällt für
 * den Rest des Tages einfach aus – die anderen laufen weiter.
 */
async function upcItemDb(code: string): Promise<Teil | null> {
  const daten = (await holeJson(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`,
  )) as { items?: Record<string, unknown>[] } | null;

  const artikel = daten?.items?.[0];
  if (!artikel) return null;

  const name = text(artikel.title);
  const bilder = Array.isArray(artikel.images) ? artikel.images : [];
  const bildUrl = bilder.map(httpsAdresse).find((url) => url !== null) ?? null;
  if (!name && !bildUrl) return null;

  return {
    name: name ? mitMarke(name, text(artikel.brand), null) : null,
    bildUrl,
    quelle: "UPCitemdb",
  };
}

/**
 * Alle Quellen fragen und zusammenlegen: die Bezeichnung von der ersten, die
 * eine hat, das Bild von der ersten, die eins hat. Die Reihenfolge ist die
 * Rangfolge – deutsche Bezeichnungen der Open-Facts-Familie vor den
 * englischen Händlertiteln von UPCitemdb.
 */
export async function sucheEan(code: string): Promise<EanTreffer | null> {
  if (!istHandelscode(code)) return null;

  const jetzt = Date.now();
  const gemerkt = gedaechtnis.get(code);
  if (gemerkt && gemerkt.bis > jetzt) return gemerkt.treffer;

  const ergebnisse = await Promise.allSettled([
    openFacts("world.openfoodfacts.org", "Open Food Facts", code),
    openFacts("world.openbeautyfacts.org", "Open Beauty Facts", code),
    openFacts("world.openproductsfacts.org", "Open Products Facts", code),
    openFacts("world.openpetfoodfacts.org", "Open Pet Food Facts", code),
    upcItemDb(code),
  ]);

  const teile = ergebnisse
    .map((ergebnis) => (ergebnis.status === "fulfilled" ? ergebnis.value : null))
    .filter((teil): teil is Teil => teil !== null);

  const benannt = teile.find(
    (teil) => teil.name !== null && !fremdeSchrift(teil.name),
  );
  const treffer: EanTreffer | null = benannt?.name
    ? {
        name: benannt.name,
        bildUrl: teile.find((teil) => teil.bildUrl !== null)?.bildUrl ?? null,
        quelle: benannt.quelle,
      }
    : null;

  if (gedaechtnis.size > 5000) gedaechtnis.clear();
  gedaechtnis.set(code, { treffer, bis: jetzt + MERKEN_MS });
  return treffer;
}

// --- Bild holen ---------------------------------------------------------------

/** Private und lokale Netze – dorthin darf der Server für niemanden Bilder holen. */
function istInterneAdresse(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const klein = ip.toLowerCase();
  return (
    klein === "::" ||
    klein === "::1" ||
    klein.startsWith("fc") ||
    klein.startsWith("fd") ||
    klein.startsWith("fe80") ||
    klein.startsWith("::ffff:")
  );
}

/**
 * Die Bildadresse kommt aus einer fremden Datenbank, in die jeder schreiben
 * kann. Bevor der Server sie abruft: nur https, kein Ziel im eigenen Netz.
 */
async function istOeffentlich(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !istInterneAdresse(host);
  try {
    const adressen = await lookup(host, { all: true });
    return adressen.length > 0 && adressen.every((a) => !istInterneAdresse(a.address));
  } catch {
    return false;
  }
}

const ENDUNG: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export interface GeladenesBild {
  bytes: Uint8Array;
  contentType: string;
  endung: string;
}

/**
 * Produktfoto von der Quelle laden. Dieselben Grenzen wie beim Hochladen von
 * Hand (Dateityp, 5 MB) – der Bucket nähme anderes ohnehin nicht an.
 * Weiterleitungen werden einzeln verfolgt, damit jede Station geprüft ist.
 */
export async function ladeBild(adresse: string): Promise<GeladenesBild | null> {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return null;
  }

  for (let sprung = 0; sprung < 4; sprung++) {
    if (!(await istOeffentlich(url))) return null;

    const antwort = await fetch(url, {
      headers: { "User-Agent": KENNUNG, Accept: "image/*" },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
      cache: "no-store",
    });

    if (antwort.status >= 300 && antwort.status < 400) {
      const ziel = antwort.headers.get("location");
      if (!ziel) return null;
      url = new URL(ziel, url);
      continue;
    }
    if (!antwort.ok) return null;

    const contentType = (antwort.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) return null;
    if (Number(antwort.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;

    const bytes = new Uint8Array(await antwort.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

    return { bytes, contentType, endung: ENDUNG[contentType] ?? "jpg" };
  }

  return null;
}
