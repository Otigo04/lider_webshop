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
  kategorie: string | null;
  /**
   * Preis fürs Regal. Der Ladenpreis, denn ein Regalschild spricht die
   * Laufkundschaft an; ohne gepflegten Ladenpreis die kleinste Staffel –
   * dieselbe Rückfallregel wie an der Kasse (counterUnitPrice()).
   */
  preis: number | null;
  /** Kleinste Großhandelsstaffel – Vorgabe für den verdeckten Code. */
  grosshandel: number | null;
  /** Streichpreis des Artikels (products.list_price), null = kein Angebot. */
  vorher: number | null;
  bestand: number;
}

interface ProductZeile {
  id: string;
  sku: string;
  name: string;
  retail_price: number | string | null;
  list_price: number | string | null;
  stock_available: number;
  category: { name: string } | null;
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
export async function getPreisschildArtikel(
  search?: string,
): Promise<PreisschildArtikel[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(
      `id, sku, name, retail_price, list_price, stock_available,
       category:categories (name),
       variants:product_variants (id, min_quantity, max_quantity, unit_price)`,
    )
    .order("name");

  const term = search?.replace(/[,()*\\%]/g, " ").trim();
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[preisschilder] Artikelliste:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as ProductZeile[]).map((row) => {
    const staffel = ueberNull(baseUnitPrice(row.variants ?? []));
    const laden = ueberNull(row.retail_price);

    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      kategorie: row.category?.name ?? null,
      preis: laden ?? staffel,
      grosshandel: staffel,
      vorher: ueberNull(row.list_price),
      bestand: toNumber(row.stock_available),
    };
  });
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
