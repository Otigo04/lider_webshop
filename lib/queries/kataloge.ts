import "server-only";
import { toNumber } from "@/lib/format";
import {
  KATALOG_VORGABE,
  type KatalogArtikel,
  type KatalogEinstellungen,
  type KatalogLayout,
  type KatalogPreisart,
  type KatalogStil,
} from "@/lib/katalog";
import { freeStock } from "@/lib/pricing";
import { istNeu } from "@/lib/product-flags";
import { getImageUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Daten für den Kataloggenerator unter /admin/kataloge.
 *
 * Eigene Abfrage statt getAdminProducts() oder der des Preisschilds: der
 * Katalog braucht Foto, Beschreibung, Merkmale und Gruppe – und ausdrücklich
 * **nicht** den Einkaufspreis. Er wird hier gar nicht erst geladen; was nicht
 * im Browser ankommt, kann auch nicht versehentlich gedruckt werden.
 */

/** PostgREST liefert höchstens so viele Zeilen je Anfrage. */
const SEITENGROESSE = 1000;

/** So viele Kennungen passen sicher in die Adresszeile einer `.in()`-Abfrage. */
const IN_BLOCK = 150;

// --- Kataloge ----------------------------------------------------------------

export interface KatalogZeile {
  id: string;
  title: string;
  subtitle: string | null;
  layout: KatalogLayout;
  stil: KatalogStil;
  preisart: KatalogPreisart;
  artikel: number;
  updatedAt: string;
}

interface KatalogRow {
  id: string;
  title: string;
  subtitle: string | null;
  layout: KatalogLayout;
  stil: KatalogStil;
  preisart: KatalogPreisart;
  zeige_barcode: boolean;
  zeige_beschreibung: boolean;
  zeige_merkmale: boolean;
  zeige_kennzeichen: boolean;
  mit_titelseite: boolean;
  mit_inhalt: boolean;
  mit_trennseiten: boolean;
  mit_rueckseite: boolean;
  rueckseite_text: string | null;
  updated_at: string;
}

/**
 * Alle Kataloge, zuletzt geänderte zuerst.
 *
 * `null` heißt: die Tabelle fehlt, Migration 051 ist noch nicht eingespielt.
 * Die Liste zeigt dann den Hinweis darauf statt eines 500ers – eine leere
 * Liste wäre etwas anderes und sähe aus, als gäbe es nur noch keine Kataloge.
 */
export async function getKataloge(): Promise<KatalogZeile[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogs")
    .select(
      "id, title, subtitle, layout, stil, preisart, updated_at, items:catalog_items (count)",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      console.warn("[kataloge] Tabelle catalogs fehlt – Migration 051 einspielen.");
      return null;
    }
    console.error("[kataloge] Liste:", error.message);
    return [];
  }

  return (
    (data ?? []) as unknown as (KatalogRow & { items: { count: number }[] })[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    layout: row.layout,
    stil: row.stil,
    preisart: row.preisart,
    artikel: row.items?.[0]?.count ?? 0,
    updatedAt: row.updated_at,
  }));
}

export interface Katalog {
  id: string;
  einstellungen: KatalogEinstellungen;
  /** Artikel in der Reihenfolge der Zusammenstellung */
  productIds: string[];
}

/** Ein Katalog samt Auswahl. null, wenn es ihn nicht gibt. */
export async function getKatalog(id: string): Promise<Katalog | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    // 22P02: die Kennung in der Adresse ist keine UUID – das ist ein 404.
    if (error.code !== "22P02") {
      console.error("[kataloge] Katalog:", error.message);
    }
    return null;
  }
  if (!data) return null;
  const row = data as KatalogRow;

  const productIds: string[] = [];
  for (let von = 0; ; von += SEITENGROESSE) {
    const { data: zeilen, error: fehler } = await supabase
      .from("catalog_items")
      .select("product_id")
      .eq("catalog_id", id)
      .order("position")
      .order("product_id")
      .range(von, von + SEITENGROESSE - 1);

    if (fehler) {
      console.error("[kataloge] Auswahl:", fehler.message);
      break;
    }
    productIds.push(...(zeilen ?? []).map((z) => z.product_id as string));
    if ((zeilen ?? []).length < SEITENGROESSE) break;
  }

  return {
    id: row.id,
    einstellungen: {
      ...KATALOG_VORGABE,
      title: row.title,
      subtitle: row.subtitle,
      layout: row.layout,
      stil: row.stil,
      preisart: row.preisart,
      zeigeBarcode: row.zeige_barcode,
      zeigeBeschreibung: row.zeige_beschreibung,
      zeigeMerkmale: row.zeige_merkmale,
      zeigeKennzeichen: row.zeige_kennzeichen,
      mitTitelseite: row.mit_titelseite,
      mitInhalt: row.mit_inhalt,
      mitTrennseiten: row.mit_trennseiten,
      mitRueckseite: row.mit_rueckseite,
      rueckseiteText: row.rueckseite_text,
    },
    productIds,
  };
}

// --- Artikel -----------------------------------------------------------------

const ARTIKEL_SPALTEN = `id, sku, name, description, barcode, retail_price,
  list_price, stock_available, stock_reserved, is_active, is_new,
  is_topseller, created_at, category_id, group_id,
  category:categories (name, slug, order_index),
  group:product_groups (name),
  variants:product_variants (min_quantity, unit_price),
  images:product_images (file_path, display_order)`;

interface ArtikelRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  retail_price: number | string | null;
  list_price: number | string | null;
  stock_available: number;
  stock_reserved: number;
  is_active: boolean;
  is_new: boolean;
  is_topseller: boolean;
  created_at: string;
  category_id: string;
  group_id: string | null;
  category: { name: string; slug: string; order_index: number } | null;
  group: { name: string } | null;
  variants: { min_quantity: number; unit_price: number | string }[];
  images: { file_path: string; display_order: number }[];
}

/** 0 zählt als „nicht gepflegt" – ein Preis von null Euro ist eine Lücke. */
function ueberNull(wert: number | string | null | undefined): number | null {
  if (wert === null || wert === undefined) return null;
  const zahl = toNumber(wert);
  return zahl > 0 ? zahl : null;
}

/**
 * Artikel für Werkbank und Bogen.
 *
 * Ohne `ids` der ganze Stamm: die Werkbank will ihn im Browser haben, um ohne
 * Nachfrage suchen zu können – wie die Preisschild-Werkbank. Mit `ids` nur
 * die genannten, in **deren** Reihenfolge: der Bogen braucht die
 * Zusammenstellung und sonst nichts.
 *
 * Ausgeblendete Artikel und solche ohne Foto bleiben drin. Ob etwas gedruckt
 * wird, entscheidet katalogAufbau() – und die Werkbank muss gerade die
 * zeigen können, die fehlen werden.
 */
export async function getKatalogArtikel(
  ids?: string[],
): Promise<KatalogArtikel[]> {
  if (ids && ids.length === 0) return [];
  const supabase = await createClient();

  const rows: ArtikelRow[] = [];
  if (ids) {
    for (let i = 0; i < ids.length; i += IN_BLOCK) {
      const { data, error } = await supabase
        .from("products")
        .select(ARTIKEL_SPALTEN)
        .in("id", ids.slice(i, i + IN_BLOCK));
      if (error) {
        console.error("[kataloge] Artikel:", error.message);
        return [];
      }
      rows.push(...((data ?? []) as unknown as ArtikelRow[]));
    }
  } else {
    for (let von = 0; ; von += SEITENGROESSE) {
      const { data, error } = await supabase
        .from("products")
        .select(ARTIKEL_SPALTEN)
        .order("name")
        .order("id")
        .range(von, von + SEITENGROESSE - 1);
      if (error) {
        console.error("[kataloge] Artikelstamm:", error.message);
        return [];
      }
      rows.push(...((data ?? []) as unknown as ArtikelRow[]));
      if ((data ?? []).length < SEITENGROESSE) break;
    }
  }

  const bildPfade = rows.map(
    (row) =>
      [...(row.images ?? [])].sort(
        (a, b) => a.display_order - b.display_order,
      )[0]?.file_path ?? null,
  );
  const [urls, merkmale] = await Promise.all([
    signiere(bildPfade),
    ladeMerkmale(rows.map((r) => r.id), ids !== undefined),
  ]);

  const jetzt = new Date();
  const artikel = rows.map((row, index): KatalogArtikel => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    beschreibung: row.description?.trim() || null,
    barcode: row.barcode?.trim() || null,
    kategorieId: row.category_id,
    kategorie: row.category?.name ?? "Ohne Warengruppe",
    kategorieSlug: row.category?.slug ?? "",
    kategorieRang: row.category?.order_index ?? 0,
    gruppeId: row.group_id,
    gruppeName: row.group?.name ?? null,
    staffeln: (row.variants ?? [])
      .map((v) => ({ ab: v.min_quantity, preis: toNumber(v.unit_price) }))
      .filter((s) => s.preis > 0)
      .sort((a, b) => a.ab - b.ab),
    laden: ueberNull(row.retail_price),
    vorher: ueberNull(row.list_price),
    bestand: freeStock(row),
    aktiv: row.is_active,
    neu: istNeu(row, jetzt),
    topseller: row.is_topseller,
    bildUrl: urls[index],
    merkmale: merkmale.get(row.id) ?? [],
  }));

  if (!ids) return artikel;
  const nachId = new Map(artikel.map((a) => [a.id, a]));
  return ids.flatMap((id) => nachId.get(id) ?? []);
}

/** Signed URLs in Blöcken – tausend Pfade in einem Aufruf sind einer zu viel. */
async function signiere(pfade: (string | null)[]): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];
  for (let i = 0; i < pfade.length; i += 500) {
    urls.push(...(await getImageUrls(pfade.slice(i, i + 500))));
  }
  return urls;
}

/**
 * Merkmale je Artikel als lesbare Paare („Farbe" · „Rot"), in der
 * Pflegereihenfolge der Merkmale.
 *
 * `gezielt` fragt nur nach den genannten Artikeln (Bogen). Für die Werkbank
 * wird die ganze Zuordnungstabelle geholt – tausend Kennungen in `.in()`
 * wären mehrere Anfragen für dasselbe Ergebnis.
 */
async function ladeMerkmale(
  productIds: string[],
  gezielt: boolean,
): Promise<Map<string, { merkmal: string; wert: string }[]>> {
  const karte = new Map<string, { merkmal: string; wert: string }[]>();
  const supabase = await createClient();

  const { data: werte, error } = await supabase
    .from("product_attribute_values")
    .select("id, label, order_index, attribute:product_attributes (name, order_index)");
  if (error) {
    // Fehlende Merkmalstabellen legen den Katalog nicht lahm.
    console.error("[kataloge] Merkmale:", error.message);
    return karte;
  }

  const nachWert = new Map(
    (
      (werte ?? []) as unknown as {
        id: string;
        label: string;
        order_index: number;
        attribute: { name: string; order_index: number } | null;
      }[]
    ).map((w) => [w.id, w]),
  );

  const links: { product_id: string; value_id: string }[] = [];
  const hole = async (block: string[] | null) => {
    for (let von = 0; ; von += SEITENGROESSE) {
      let query = supabase
        .from("product_attribute_links")
        .select("product_id, value_id")
        .order("product_id")
        .order("value_id")
        .range(von, von + SEITENGROESSE - 1);
      if (block) query = query.in("product_id", block);
      const { data, error: fehler } = await query;
      if (fehler) {
        console.error("[kataloge] Merkmalszuordnung:", fehler.message);
        return;
      }
      links.push(...((data ?? []) as typeof links));
      if ((data ?? []).length < SEITENGROESSE) return;
    }
  };

  if (gezielt) {
    for (let i = 0; i < productIds.length; i += IN_BLOCK) {
      await hole(productIds.slice(i, i + IN_BLOCK));
    }
  } else {
    await hole(null);
  }

  const roh = new Map<string, NonNullable<ReturnType<typeof nachWert.get>>[]>();
  for (const link of links) {
    const wert = nachWert.get(link.value_id);
    if (!wert) continue;
    roh.set(link.product_id, [...(roh.get(link.product_id) ?? []), wert]);
  }

  for (const [id, liste] of roh) {
    karte.set(
      id,
      liste
        .sort(
          (a, b) =>
            (a.attribute?.order_index ?? 0) - (b.attribute?.order_index ?? 0) ||
            a.order_index - b.order_index,
        )
        .map((w) => ({ merkmal: w.attribute?.name ?? "", wert: w.label })),
    );
  }
  return karte;
}
