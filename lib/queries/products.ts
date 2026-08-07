import "server-only";
import type { ProductFlag } from "@/lib/actions/admin-products";
import { createClient } from "@/lib/supabase/server";
import { getImageUrls } from "@/lib/storage";
import type { Category, Product, ProductImage, ProductVariant } from "@/lib/types";

/**
 * Lesezugriffe auf den Katalog. Alles läuft über den Session-Client, damit RLS
 * greift – ein deaktivierter Kunde bekommt hier schlicht leere Ergebnisse.
 */

export interface ProductListItem extends Product {
  variants: ProductVariant[];
  /** Signierte URL des ersten Fotos, null wenn keins hinterlegt ist */
  imageUrl: string | null;
}

/**
 * Schaufenster-Ansicht für nicht angemeldete Besucher: kommt aus der View
 * `products_public` (siehe migrations/006), die bewusst weder Bestand noch
 * Preise enthält.
 */
export interface PublicProductListItem {
  id: string;
  category_id: string;
  sku: string;
  name: string;
  description: string | null;
  is_new: boolean;
  is_topseller: boolean;
  imageUrl: string | null;
  /**
   * Günstigster Stückpreis für die "ab"-Angabe. Kommt aus der View
   * product_price_range (Migration 013) – die einzelnen Staffeln bleiben
   * angemeldeten Kunden vorbehalten. null, solange die Migration nicht
   * eingespielt ist oder der Artikel keine Preise hat.
   */
  priceFrom: number | null;
  minOrderQuantity: number | null;
}

let viewFehltGemeldet = false;

interface PriceRangeRow {
  min_unit_price: number;
  min_order_quantity: number;
}

/**
 * "Ab"-Preise für eine Menge Artikel. Fehlt die View noch, wird das einmal
 * geloggt und die Seite zeigt weiter "Preis nach Anmeldung" – kein Grund,
 * das ganze Schaufenster scheitern zu lassen.
 */
async function priceRangesFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, PriceRangeRow>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("product_price_range")
    .select("product_id, min_unit_price, min_order_quantity")
    .in("product_id", ids);

  if (error) {
    // Fehlt die View noch, wäre das sonst ein Fehler pro Seitenaufruf.
    if (error.code === "PGRST205") {
      if (!viewFehltGemeldet) {
        viewFehltGemeldet = true;
        console.warn(
          "[katalog] Ohne Migration 013 keine Ab-Preise – Seiten zeigen 'Preis nach Anmeldung'.",
        );
      }
    } else {
      console.error("[katalog] Ab-Preise:", error.message);
    }
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      row.product_id as string,
      {
        min_unit_price: Number(row.min_unit_price),
        min_order_quantity: Number(row.min_order_quantity),
      },
    ]),
  );
}

/** `category` ist hier immer geladen – deshalb null statt undefined. */
export interface ProductDetail extends Omit<Product, "category"> {
  variants: ProductVariant[];
  images: ProductImage[];
  category: Category | null;
  imageUrls: (string | null)[];
}

const LIST_COLUMNS = `
  id, category_id, sku, name, description, is_active, is_new, is_topseller,
  stock_available, stock_reserved, created_by, created_at, updated_at,
  variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at),
  images:product_images (id, product_id, file_path, display_order, created_at)
`;

/**
 * PostgREST trennt `or`-Bedingungen mit Komma und klammert mit (). Zeichen, die
 * dort Bedeutung haben, müssen raus, sonst lässt sich der Filter über das
 * Suchfeld manipulieren.
 */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()*\\%]/g, " ").trim();
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("order_index")
    .order("name");

  if (error) {
    console.error("[katalog] Kategorien:", error.message);
    return [];
  }
  return data as Category[];
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Category) ?? null;
}

export async function getProducts(options?: {
  categoryId?: string;
  search?: string;
  flag?: ProductFlag;
}): Promise<ProductListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(LIST_COLUMNS)
    .eq("is_active", true)
    .order("name");

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  if (options?.flag) {
    query = query.eq(options.flag, true);
  }

  const term = options?.search ? sanitizeSearch(options.search) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[katalog] Artikel:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as (Product & {
    variants: ProductVariant[];
    images: ProductImage[];
  })[];

  // Alle Titelbilder in einem Rutsch signieren statt pro Artikel einzeln.
  const coverPaths = rows.map((row) => firstImagePath(row.images));
  const urls = await getImageUrls(coverPaths);

  return rows.map((row, index) => ({
    ...row,
    variants: row.variants ?? [],
    imageUrl: urls[index],
  }));
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(`${LIST_COLUMNS}, category:categories (*)`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[katalog] Artikeldetail:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as Product & {
    variants: ProductVariant[];
    images: ProductImage[];
    category: Category | null;
  };

  const images = sortImages(row.images ?? []);
  const imageUrls = await getImageUrls(images.map((image) => image.file_path));

  return {
    ...row,
    variants: row.variants ?? [],
    images,
    category: row.category ?? null,
    imageUrls,
  };
}

/** Schaufenster-Detail: dieselben Felder wie die Liste, plus alle Fotos. */
export interface PublicProductDetail extends PublicProductListItem {
  category: Category | null;
  imageUrls: (string | null)[];
}

/**
 * Katalog für nicht angemeldete Besucher. Liest aus `products_public`
 * (keine Bestandsspalten) statt aus `products` – Preise werden gar nicht
 * erst abgefragt, RLS würde sie ohnehin nicht herausgeben.
 */
export async function getPublicProducts(options?: {
  categoryId?: string;
  search?: string;
  flag?: ProductFlag;
}): Promise<PublicProductListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products_public")
    .select("id, category_id, sku, name, description, is_new, is_topseller")
    .order("name");

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  if (options?.flag) {
    query = query.eq(options.flag, true);
  }

  const term = options?.search ? sanitizeSearch(options.search) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data: products, error } = await query;
  if (error) {
    console.error("[katalog] Öffentliche Artikel:", error.message);
    return [];
  }

  const ids = (products ?? []).map((p) => p.id as string);
  const [coverPaths, preise] = await Promise.all([
    firstImagePathsFor(supabase, ids),
    priceRangesFor(supabase, ids),
  ]);
  const urls = await getImageUrls(ids.map((id) => coverPaths.get(id) ?? null));

  return (products ?? []).map((row, index) => {
    const preis = preise.get(row.id as string);
    return {
      id: row.id as string,
      category_id: row.category_id as string,
      sku: row.sku as string,
      name: row.name as string,
      description: row.description as string | null,
      is_new: row.is_new as boolean,
      is_topseller: row.is_topseller as boolean,
      imageUrl: urls[index],
      priceFrom: preis?.min_unit_price ?? null,
      minOrderQuantity: preis?.min_order_quantity ?? null,
    };
  });
}

/** Warengruppe mit der Zahl der darin gelisteten Artikel. */
export interface LandingCategory extends Category {
  productCount: number;
}

export interface LandingData {
  neuheiten: PublicProductListItem[];
  topseller: PublicProductListItem[];
  categories: LandingCategory[];
  /** Gesamtzahl gelisteter Artikel – Kennzahl in der Über-uns-Sektion */
  productCount: number;
  /** Zuletzt aufgenommene Artikel für das Katalogband im Kopfbereich */
  ticker: PublicProductListItem[];
}

/**
 * Alles, was die Landingpage an Katalogdaten braucht, in einem Rutsch.
 *
 * Bewusst eine Funktion statt drei: jede Abfrage müsste sonst eigene
 * Bild-URLs signieren lassen, und der Bildabruf ist der teure Teil. So wird
 * pro Artikel genau eine URL signiert, egal in wie vielen Sektionen er steht.
 */
export async function getLandingData(perSection = 8): Promise<LandingData> {
  const supabase = await createClient();

  const leer: LandingData = {
    neuheiten: [],
    topseller: [],
    categories: [],
    productCount: 0,
    ticker: [],
  };

  const [{ data: rows, error }, categories] = await Promise.all([
    supabase
      .from("products_public")
      .select("id, category_id, sku, name, description, is_new, is_topseller, created_at")
      .order("created_at", { ascending: false }),
    getCategories(),
  ]);

  if (error) {
    console.error("[katalog] Landingpage:", error.message);
    return leer;
  }
  if (!rows?.length) return { ...leer, categories: categories.map(ohneArtikel) };

  // Bilder und Preise nur für die Artikel holen, die tatsächlich auf der Seite
  // landen – hervorgehobene plus die des Laufbands. Der restliche Katalog
  // zählt nur für die Kennzahlen.
  const hervorgehoben = rows
    .filter((row) => row.is_new || row.is_topseller)
    .slice(0, perSection * 2);
  const bandZeilen = rows.slice(0, 10);

  const ids = [
    ...new Set([...hervorgehoben, ...bandZeilen].map((row) => row.id as string)),
  ];
  const [coverPaths, preise] = await Promise.all([
    firstImagePathsFor(supabase, ids),
    priceRangesFor(supabase, ids),
  ]);
  const urls = await getImageUrls(ids.map((id) => coverPaths.get(id) ?? null));
  const bilder = new Map(ids.map((id, index) => [id, urls[index]]));

  const zuArtikel = (row: (typeof rows)[number]): PublicProductListItem => {
    const id = row.id as string;
    const preis = preise.get(id);
    return {
      id,
      category_id: row.category_id as string,
      sku: row.sku as string,
      name: row.name as string,
      description: row.description as string | null,
      is_new: row.is_new as boolean,
      is_topseller: row.is_topseller as boolean,
      imageUrl: bilder.get(id) ?? null,
      priceFrom: preis?.min_unit_price ?? null,
      minOrderQuantity: preis?.min_order_quantity ?? null,
    };
  };

  const items = hervorgehoben.map(zuArtikel);

  const proKategorie = new Map<string, number>();
  for (const row of rows) {
    const id = row.category_id as string;
    proKategorie.set(id, (proKategorie.get(id) ?? 0) + 1);
  }

  return {
    neuheiten: items.filter((p) => p.is_new).slice(0, perSection),
    topseller: items.filter((p) => p.is_topseller).slice(0, perSection),
    categories: categories.map((category) => ({
      ...category,
      productCount: proKategorie.get(category.id) ?? 0,
    })),
    productCount: rows.length,
    ticker: bandZeilen.map(zuArtikel),
  };
}

function ohneArtikel(category: Category): LandingCategory {
  return { ...category, productCount: 0 };
}

export async function getPublicProduct(id: string): Promise<PublicProductDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products_public")
    .select(
      "id, category_id, sku, name, description, is_new, is_topseller, category:categories (*)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[katalog] Öffentliches Artikeldetail:", error.message);
    return null;
  }
  if (!data) return null;

  const { data: imageRows } = await supabase
    .from("product_images")
    .select("id, product_id, file_path, display_order, created_at")
    .eq("product_id", id);

  const images = sortImages((imageRows ?? []) as ProductImage[]);
  const [imageUrls, preise] = await Promise.all([
    getImageUrls(images.map((image) => image.file_path)),
    priceRangesFor(supabase, [id]),
  ]);
  const preis = preise.get(id);

  const row = data as unknown as {
    id: string;
    category_id: string;
    sku: string;
    name: string;
    description: string | null;
    is_new: boolean;
    is_topseller: boolean;
    category: Category | null;
  };

  return {
    id: row.id,
    category_id: row.category_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    is_new: row.is_new,
    is_topseller: row.is_topseller,
    category: row.category ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    priceFrom: preis?.min_unit_price ?? null,
    minOrderQuantity: preis?.min_order_quantity ?? null,
  };
}

/** Erstes Foto je Artikel-ID, für die Titelbilder im öffentlichen Grid. */
async function firstImagePathsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (productIds.length === 0) return result;

  const { data, error } = await supabase
    .from("product_images")
    .select("product_id, file_path, display_order")
    .in("product_id", productIds);

  if (error) {
    console.error("[katalog] Öffentliche Titelbilder:", error.message);
    return result;
  }

  const byProduct = new Map<string, { file_path: string; display_order: number }[]>();
  for (const row of data ?? []) {
    const list = byProduct.get(row.product_id as string) ?? [];
    list.push({
      file_path: row.file_path as string,
      display_order: row.display_order as number,
    });
    byProduct.set(row.product_id as string, list);
  }

  for (const id of productIds) {
    const images = byProduct.get(id);
    if (!images || images.length === 0) {
      result.set(id, null);
      continue;
    }
    images.sort((a, b) => a.display_order - b.display_order);
    result.set(id, images[0].file_path);
  }

  return result;
}

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.display_order - b.display_order);
}

function firstImagePath(images: ProductImage[] | null): string | null {
  if (!images || images.length === 0) return null;
  return sortImages(images)[0].file_path;
}
