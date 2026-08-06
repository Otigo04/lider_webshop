import "server-only";
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
  imageUrl: string | null;
}

/** `category` ist hier immer geladen – deshalb null statt undefined. */
export interface ProductDetail extends Omit<Product, "category"> {
  variants: ProductVariant[];
  images: ProductImage[];
  category: Category | null;
  imageUrls: (string | null)[];
}

const LIST_COLUMNS = `
  id, category_id, sku, name, description, is_active, is_new,
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
}): Promise<PublicProductListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products_public")
    .select("id, category_id, sku, name, description")
    .order("name");

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
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
  const coverPaths = await firstImagePathsFor(supabase, ids);
  const urls = await getImageUrls(ids.map((id) => coverPaths.get(id) ?? null));

  return (products ?? []).map((row, index) => ({
    id: row.id as string,
    category_id: row.category_id as string,
    sku: row.sku as string,
    name: row.name as string,
    description: row.description as string | null,
    imageUrl: urls[index],
  }));
}

/**
 * Als "Neuheit" markierte Artikel für die Landingpage-Sektion. Öffentlich
 * (keine Preise/Bestände), deshalb dieselbe products_public-View wie
 * getPublicProducts – nur zusätzlich nach is_new gefiltert.
 */
export async function getFeaturedProducts(limit = 6): Promise<PublicProductListItem[]> {
  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products_public")
    .select("id, category_id, sku, name, description")
    .eq("is_new", true)
    .order("name")
    .limit(limit);

  if (error) {
    console.error("[katalog] Neuheiten:", error.message);
    return [];
  }

  const ids = (products ?? []).map((p) => p.id as string);
  const coverPaths = await firstImagePathsFor(supabase, ids);
  const urls = await getImageUrls(ids.map((id) => coverPaths.get(id) ?? null));

  return (products ?? []).map((row, index) => ({
    id: row.id as string,
    category_id: row.category_id as string,
    sku: row.sku as string,
    name: row.name as string,
    description: row.description as string | null,
    imageUrl: urls[index],
  }));
}

export async function getPublicProduct(id: string): Promise<PublicProductDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products_public")
    .select("id, category_id, sku, name, description, category:categories (*)")
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
  const imageUrls = await getImageUrls(images.map((image) => image.file_path));

  const row = data as unknown as {
    id: string;
    category_id: string;
    sku: string;
    name: string;
    description: string | null;
    category: Category | null;
  };

  return {
    id: row.id,
    category_id: row.category_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
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
