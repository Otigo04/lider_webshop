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

/** `category` ist hier immer geladen – deshalb null statt undefined. */
export interface ProductDetail extends Omit<Product, "category"> {
  variants: ProductVariant[];
  images: ProductImage[];
  category: Category | null;
  imageUrls: (string | null)[];
}

const LIST_COLUMNS = `
  id, category_id, sku, name, description, is_active,
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

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.display_order - b.display_order);
}

function firstImagePath(images: ProductImage[] | null): string | null {
  if (!images || images.length === 0) return null;
  return sortImages(images)[0].file_path;
}
