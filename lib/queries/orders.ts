import "server-only";
import { createClient } from "@/lib/supabase/server";
import { freeStock, minOrderQuantity } from "@/lib/pricing";
import { firstImagePath } from "@/lib/queries/products";
import type {
  AppUser,
  CartItem,
  Invoice,
  Order,
  OrderItem,
  OrderStatus,
  ProductImage,
  ProductVariant,
} from "@/lib/types";

/**
 * Bestellungen des angemeldeten Kunden. Die Eingrenzung macht RLS
 * (orders_select_own) – hier wird bewusst nicht zusätzlich nach customer_id
 * gefiltert, damit Admin-Ansichten dieselben Funktionen nutzen können.
 */

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

const ORDER_COLUMNS = `
  id, customer_id, order_number, status, total_amount, notes,
  delivery_method, payment_method, vat_rate,
  delivery_address, delivery_name, delivery_street, delivery_zip,
  delivery_city, delivery_country, pickup_at, ready_at,
  created_at, updated_at,
  items:order_items (
    id, order_id, product_variant_id, product_name, product_sku,
    quantity, unit_price, subtotal, created_at
  )
`;

export async function getOrders(options?: {
  status?: OrderStatus;
}): Promise<OrderWithItems[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[bestellungen] Liste:", error.message);
    return [];
  }
  return (data ?? []) as unknown as OrderWithItems[];
}

export async function getOrder(id: string): Promise<OrderWithItems | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[bestellungen] Detail:", error.message);
    return null;
  }
  return (data as unknown as OrderWithItems) ?? null;
}

export interface Nachbestellung {
  /** Mit heutigem Preis und Bestand, Menge auf den freien Bestand begrenzt */
  items: CartItem[];
  /** Positionen, die es so nicht mehr gibt: ausgelistet oder ausverkauft */
  fehlend: string[];
}

/**
 * Warenkorbpositionen für „Erneut bestellen". Preise und Bestand kommen
 * frisch aus dem Katalog – die Bestellung hält nur den Stand von damals.
 *
 * Gefunden wird der Artikel über die bestellte Staffel, ersatzweise über die
 * Artikelnummer: eine Staffel, die seitdem neu angelegt wurde, hat eine neue
 * Kennung, und order_items verliert sie dann (ON DELETE SET NULL).
 */
export async function getNachbestellung(items: OrderItem[]): Promise<Nachbestellung> {
  if (items.length === 0) return { items: [], fehlend: [] };
  const supabase = await createClient();

  const staffelIds = items
    .map((item) => item.product_variant_id)
    .filter((id): id is string => id !== null);
  const { data: staffeln } = staffelIds.length
    ? await supabase.from("product_variants").select("id, product_id").in("id", staffelIds)
    : { data: [] as { id: string; product_id: string }[] };
  const artikelZurStaffel = new Map((staffeln ?? []).map((s) => [s.id, s.product_id]));

  const ids = [...new Set(artikelZurStaffel.values())];
  const skus = [...new Set(items.map((item) => item.product_sku))];
  const filter = [
    ids.length ? `id.in.(${ids.join(",")})` : null,
    `sku.in.(${skus.map((sku) => `"${sku.replaceAll('"', '\\"')}"`).join(",")})`,
  ]
    .filter(Boolean)
    .join(",");

  const { data, error } = await supabase
    .from("products")
    .select(
      `id, sku, name, is_active, has_image, stock_available, stock_reserved,
       variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at),
       images:product_images (id, product_id, file_path, display_order, created_at)`,
    )
    .or(filter);
  if (error) {
    console.error("[bestellungen] Nachbestellung:", error.message);
    return { items: [], fehlend: items.map((item) => item.product_name) };
  }

  type Zeile = {
    id: string;
    sku: string;
    name: string;
    is_active: boolean;
    has_image: boolean;
    stock_available: number;
    stock_reserved: number;
    variants: ProductVariant[] | null;
    images: ProductImage[] | null;
  };
  const artikel = (data ?? []) as unknown as Zeile[];
  const nachId = new Map(artikel.map((a) => [a.id, a]));
  const nachSku = new Map(artikel.map((a) => [a.sku, a]));

  const ergebnis = new Map<string, CartItem>();
  const fehlend: string[] = [];

  for (const item of items) {
    const produktId = item.product_variant_id
      ? artikelZurStaffel.get(item.product_variant_id)
      : undefined;
    const a = (produktId ? nachId.get(produktId) : undefined) ?? nachSku.get(item.product_sku);
    const tiers = a?.variants ?? [];
    const frei = a ? freeStock(a) : 0;
    const min = minOrderQuantity(tiers);

    // Dieselben Regeln wie im Sortiment: aktiv, mit Foto, mit Preis, auf Lager.
    if (!a || !a.is_active || !a.has_image || tiers.length === 0 || frei < min) {
      fehlend.push(item.product_name);
      continue;
    }

    const vorher = ergebnis.get(a.id)?.quantity ?? 0;
    ergebnis.set(a.id, {
      productId: a.id,
      productName: a.name,
      productSku: a.sku,
      quantity: Math.min(Math.max(vorher + item.quantity, min), frei),
      tiers,
      maxStock: frei,
      imagePath: firstImagePath(a.images),
    });
  }

  return { items: [...ergebnis.values()], fehlend };
}

/**
 * Bestellung samt vollständigem Kundenprofil.
 *
 * getOrder() lädt den Kunden bewusst nicht mit – im Checkout steht er schon
 * fest und wird übergeben. Rechnung und Lieferschein brauchen dagegen die
 * Rechnungsanschrift und die USt-IdNr. aus dem Profil, und beide werden lange
 * nach dem Checkout gedruckt.
 */
export interface OrderWithCustomer extends Omit<OrderWithItems, "customer"> {
  /** null, wenn das Profil gelöscht wurde – Order selbst hat es optional. */
  customer: AppUser | null;
}

export async function getOrderWithCustomer(
  id: string,
): Promise<OrderWithCustomer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`${ORDER_COLUMNS}, customer:users (*)`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[bestellungen] Detail mit Kunde:", error.message);
    return null;
  }
  return (data as unknown as OrderWithCustomer) ?? null;
}

/**
 * Rechnung zu einer Bestellung. RLS (invoices_select_own / invoices_admin_all)
 * regelt Kunden- und Admin-Zugriff über dieselbe Abfrage.
 */
export async function getInvoiceForOrder(orderId: string): Promise<Invoice | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[rechnung] Detail:", error.message);
    return null;
  }
  return (data as Invoice) ?? null;
}
