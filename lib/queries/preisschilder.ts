import "server-only";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import {
  LABEL_VORGABEN,
  STANDARD_FORMATE,
  type LabelOption,
  type SchildFormat,
} from "@/lib/preisschild";
import { baseUnitPrice } from "@/lib/pricing";
import { sucheWortweise } from "@/lib/search";
import { getImageUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { PriceTier } from "@/lib/types";

/**
 * Daten für den Preisschild-Generator unter /admin/preisschilder.
 *
 * Eigene, schlanke Abfrage statt getAdminProducts(): die Werkbank ist eine
 * Client-Komponente, der ganze Artikelbestand geht als JSON in den Browser.
 * Flags, Beschreibungen, Merkmale und Gruppen haben auf einem Preisschild
 * nichts verloren und müssen deshalb auch nicht über die Leitung.
 */

export interface PreisschildArtikel {
  id: string;
  sku: string;
  name: string;
  /** Barcode des Artikels, null = keiner gepflegt. Optional aufs Schild. */
  barcode: string | null;
  /** Warengruppe des Artikels – Vorgabe, wenn aus ihm ein neuer entsteht. */
  kategorieId: string;
  kategorie: string | null;
  /**
   * Preis fürs Regal. Der Ladenpreis, denn ein Regalschild spricht die
   * Laufkundschaft an; ohne gepflegten Ladenpreis die kleinste Staffel –
   * dieselbe Rückfallregel wie an der Kasse (counterUnitPrice()).
   */
  preis: number | null;
  /** Kleinste Großhandelsstaffel – Vorgabe für den verdeckten Code. */
  grosshandel: number | null;
  /**
   * Einkaufspreis (Migration 047). Steht **nicht** auf dem Schild – der
   * verdeckte Code trägt weiter den Großhandelspreis. Er wird im freien
   * Generator nur angezeigt und beim Anlegen eines Artikels übernommen.
   */
  einkauf: number | null;
  /** Streichpreis des Artikels (products.list_price), null = kein Angebot. */
  vorher: number | null;
  bestand: number;
}

interface ProductZeile {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  category_id: string;
  retail_price: number | string | null;
  list_price: number | string | null;
  stock_available: number;
  category: { name: string } | null;
  /**
   * PostgREST liefert die Eins-zu-eins-Beziehung je nach erkannter
   * Kardinalität als Objekt oder als einelementiges Array – beides abfangen.
   */
  cost:
    | { cost_price: number | string | null }
    | { cost_price: number | string | null }[]
    | null;
  variants: PriceTier[];
}

/**
 * Artikel für die Auswahlliste.
 *
 * Ausgeblendete Artikel (is_active = false) bleiben drin: ein Artikel, der im
 * Shop nicht erscheinen soll, steht trotzdem im Regal und braucht ein Schild.
 * Umgekehrt ist ein fehlendes Foto hier kein Ausschlussgrund – auf dem Schild
 * ist ohnehin keins.
 */
const ARTIKEL_SPALTEN = `id, sku, name, barcode, retail_price, list_price,
  stock_available, category_id,
  category:categories (name),
  cost:product_costs (cost_price),
  variants:product_variants (id, min_quantity, max_quantity, unit_price)`;

export async function getPreisschildArtikel(
  search?: string,
  limit?: number,
): Promise<PreisschildArtikel[]> {
  const supabase = await createClient();

  let query = supabase.from("products").select(ARTIKEL_SPALTEN).order("name");

  const term = search?.replace(/[,()*\\%]/g, " ").trim();
  if (term) {
    query = sucheWortweise(query, ["name", "sku", "barcode"], term);
  }
  // Ohne Grenze: die Werkbank will den ganzen Bestand im Browser haben, um
  // ohne Nachfrage filtern zu können. Die Trefferliste des freien Generators
  // dagegen soll kurz bleiben.
  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[preisschilder] Artikelliste:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as ProductZeile[]).map(zuPreisschildArtikel);
}

/** Eine Artikelzeile in die Form bringen, die der Generator braucht. */
function zuPreisschildArtikel(row: ProductZeile): PreisschildArtikel {
  const staffel = ueberNull(baseUnitPrice(row.variants ?? []));
  const laden = ueberNull(row.retail_price);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    barcode: row.barcode?.trim() || null,
    kategorieId: row.category_id,
    kategorie: row.category?.name ?? null,
    preis: laden ?? staffel,
    grosshandel: staffel,
    einkauf: ueberNull(
      (Array.isArray(row.cost) ? row.cost[0] : row.cost)?.cost_price,
    ),
    /*
     * Ohne gepflegten Ladenpreis keine Reduzierung (siehe CLAUDE.md,
     * Abschnitt „Reduzierte Artikel"): `preis` fällt oben ohne `laden` auf die
     * Großhandelsstaffel zurück, und `schildPreis()` übergibt genau dieses
     * `preis` an `reduzierung()` als Bezug. Stünde hier trotzdem der rohe
     * `list_price`, würde die Staffel lautlos als Ladenpreis durchgehen und
     * die Reduzierung gegen den Großhandelspreis gerechnet – mal ergäbe das
     * keine Reduzierung mehr (weißes Schild mit dem alten Preis), mal eine
     * falsche (der eigentlich reduzierte Preis stünde als normaler da). Genau
     * der Fehler, den Migration 045 im Shop schon behoben hat, hier aber
     * nicht mitgezogen war.
     */
    vorher: laden !== null ? ueberNull(row.list_price) : null,
    bestand: toNumber(row.stock_available),
  };
}

/**
 * Artikel zu einem gescannten Code – Barcode zuerst, Artikelnummer als
 * Notnagel.
 *
 * Dieselbe Reihenfolge wie an der Kasse (findProductByCode()): der Barcode
 * steht auf der Ware und ist eindeutig, die Artikelnummer tippt jemand, wenn
 * das Etikett nicht mehr lesbar ist. Eigene Abfrage statt der Kassenversion,
 * weil das Preisschild den Streichpreis braucht – den führt die Kasse nicht.
 */
export async function findPreisschildArtikel(
  code: string,
): Promise<PreisschildArtikel | null> {
  const gesucht = code.trim();
  if (!gesucht) return null;

  const supabase = await createClient();

  const { data: perBarcode, error } = await supabase
    .from("products")
    .select(ARTIKEL_SPALTEN)
    .eq("barcode", gesucht)
    .maybeSingle();

  if (error) console.error("[preisschilder] Barcode-Suche:", error.message);
  if (perBarcode) {
    return zuPreisschildArtikel(perBarcode as unknown as ProductZeile);
  }

  const { data: perSku } = await supabase
    .from("products")
    .select(ARTIKEL_SPALTEN)
    .eq("sku", gesucht)
    .maybeSingle();

  return perSku ? zuPreisschildArtikel(perSku as unknown as ProductZeile) : null;
}

/**
 * 0 zählt als „nicht gepflegt".
 *
 * Ein Artikel ohne Ladenpreis und ohne Staffel käme sonst mit 0,00 € auf das
 * Schild, und das fiele erst auf dem geschnittenen Papier auf. Ein Preis von
 * null Euro ist im Laden keine Aussage, sondern eine Lücke – die Werkbank
 * schreibt „kein Preis" und warnt an der Zeile.
 */
function ueberNull(wert: number | string | null | undefined): number | null {
  if (wert === null || wert === undefined) return null;
  const zahl = toNumber(wert);
  return zahl > 0 ? zahl : null;
}

/**
 * Schildformate (Migration 039).
 *
 * Fällt auf die drei Vorgaben zurück, wenn die Tabelle fehlt oder leer ist:
 * ohne Format ließe sich kein einziges Schild drucken, und eine noch nicht
 * eingespielte Migration darf den Generator nicht lahmlegen.
 */
export async function getLabelSizes(): Promise<SchildFormat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("label_sizes")
    .select("id, name, width_mm, height_mm, order_index")
    .order("order_index")
    .order("created_at");

  if (error) {
    if (error.code === "42P01") {
      console.warn(
        "[preisschilder] Tabelle label_sizes fehlt – Migration 039 einspielen.",
      );
    } else {
      console.error("[preisschilder] Schildgrößen:", error.message);
    }
    return STANDARD_FORMATE;
  }

  const zeilen = (data ?? []) as {
    id: string;
    name: string;
    width_mm: number | string;
    height_mm: number | string;
  }[];

  if (zeilen.length === 0) return STANDARD_FORMATE;

  return zeilen.map((zeile) => ({
    id: zeile.id,
    name: zeile.name,
    breite: toNumber(zeile.width_mm),
    hoehe: toNumber(zeile.height_mm),
  }));
}

export interface LabelIcon {
  id: string;
  name: string;
  file_path: string;
  /** Signed URL für die Anzeige in der Werkbank. Der Bogen nimmt Data-URIs. */
  url: string | null;
}

/** Symbolbibliothek, neueste zuletzt – die Reihenfolge des Anlegens. */
export async function getLabelIcons(): Promise<LabelIcon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("label_icons")
    .select("id, name, file_path, created_at")
    .order("created_at");

  if (error) {
    // 42P01 = Tabelle fehlt: Migration 038 noch nicht eingespielt. Der
    // Generator funktioniert ohne Symbole weiter, nur eben ohne Bibliothek.
    if (error.code === "42P01") {
      console.warn(
        "[preisschilder] Tabelle label_icons fehlt – Migration 038 einspielen.",
      );
      return [];
    }
    console.error("[preisschilder] Symbole:", error.message);
    return [];
  }

  const zeilen = (data ?? []) as { id: string; name: string; file_path: string }[];
  const urls = await getImageUrls(zeilen.map((z) => z.file_path));

  return zeilen.map((zeile, index) => ({
    id: zeile.id,
    name: zeile.name,
    file_path: zeile.file_path,
    url: urls[index],
  }));
}

/**
 * Symbole als Data-URI, für den Druckbogen.
 *
 * Nicht als Signed URL wie sonst: der Bogen öffnet sich in einem eigenen
 * Fenster und ruft sofort den Druckdialog. Ein Bild, das erst noch geladen
 * werden muss, kommt womöglich nach dem Dialog – dann fehlt es auf dem Papier.
 * Dasselbe Argument wie beim Logo des Kassenbons.
 */
export async function getLabelIconDataUris(
  ids: string[],
): Promise<Map<string, string>> {
  const eindeutig = [...new Set(ids)];
  const karte = new Map<string, string>();
  if (eindeutig.length === 0) return karte;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("label_icons")
    .select("id, file_path")
    .in("id", eindeutig);

  if (error) {
    console.error("[preisschilder] Symbole laden:", error.message);
    return karte;
  }

  await Promise.all(
    ((data ?? []) as { id: string; file_path: string }[]).map(async (zeile) => {
      const { data: datei, error: ladefehler } = await supabase.storage
        .from(PRODUCT_BUCKET)
        .download(zeile.file_path);

      if (ladefehler || !datei) {
        console.error(
          "[preisschilder] Symboldatei:",
          ladefehler?.message ?? zeile.file_path,
        );
        return;
      }

      const bytes = Buffer.from(await datei.arrayBuffer());
      const typ = datei.type || "image/png";
      karte.set(zeile.id, `data:${typ};base64,${bytes.toString("base64")}`);
    }),
  );

  return karte;
}

/**
 * Labels für Preisschilder: „Neu", „Topseller" und die Artikel-Flags
 * (Migration 021), jeweils mit der Farbe aus label_badge_colors
 * (Migration 040). Ohne gespeicherte Farbe gilt die Vorgabe – bei Flags die
 * Farbe ihres Farbpunkts in der Artikelliste.
 */
export async function getLabelOptionen(): Promise<LabelOption[]> {
  const supabase = await createClient();
  const [flags, farben] = await Promise.all([
    supabase.from("product_flags").select("id, name, color").order("created_at"),
    supabase.from("label_badge_colors").select("badge_key, color"),
  ]);

  if (flags.error) console.error("[preisschilder] Flags:", flags.error.message);
  if (farben.error && farben.error.code !== "42P01") {
    console.error("[preisschilder] Labelfarben:", farben.error.message);
  } else if (farben.error) {
    console.warn(
      "[preisschilder] Tabelle label_badge_colors fehlt – Migration 040 einspielen.",
    );
  }

  const gespeichert = new Map(
    ((farben.data ?? []) as { badge_key: string; color: string }[]).map((z) => [
      z.badge_key,
      z.color,
    ]),
  );

  const optionen: LabelOption[] = [
    { key: "neu", name: "Neu", farbe: LABEL_VORGABEN.neu },
    { key: "topseller", name: "Topseller", farbe: LABEL_VORGABEN.topseller },
    ...((flags.data ?? []) as { id: string; name: string; color: number }[]).map(
      (flag) => ({
        key: `flag:${flag.id}`,
        name: flag.name,
        farbe: LABEL_VORGABEN.flags[flag.color - 1] ?? LABEL_VORGABEN.flags[0],
      }),
    ),
  ];

  return optionen.map((o) => ({ ...o, farbe: gespeichert.get(o.key) ?? o.farbe }));
}
