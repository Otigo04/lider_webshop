import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import type {
  AccessRequest,
  AppUser,
  Order,
  OrderItem,
  Product,
  ProductVariant,
} from "@/lib/types";

/**
 * Datenzugriffe für das Admin-Panel. Läuft über den Session-Client: die
 * *_admin_all-Policies geben Admins Vollzugriff, ein Kunde bekommt hier nichts
 * zu sehen. Der Service-Key wird nur dort gebraucht, wo Konten angelegt oder
 * gelöscht werden (lib/actions/admin-customers.ts).
 */

export interface AdminProductRow extends Omit<Product, "category"> {
  category: { id: string; name: string } | null;
  variants: ProductVariant[];
}

export interface AdminOrderRow extends Omit<Order, "customer"> {
  customer: Pick<AppUser, "id" | "email" | "full_name" | "company_name"> | null;
  items: OrderItem[];
}

export interface DashboardStats {
  customersActive: number;
  customersInactive: number;
  products: number;
  categories: number;
  ordersOpen: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };

  const [active, inactive, products, categories, ordersOpen] = await Promise.all([
    supabase
      .from("users")
      .select("id", head)
      .eq("role", "customer")
      .eq("is_active", true),
    supabase
      .from("users")
      .select("id", head)
      .eq("role", "customer")
      .eq("is_active", false),
    supabase.from("products").select("id", head),
    supabase.from("categories").select("id", head),
    supabase
      .from("orders")
      .select("id", head)
      .in("status", ["submitted", "confirmed"]),
  ]);

  return {
    customersActive: active.count ?? 0,
    customersInactive: inactive.count ?? 0,
    products: products.count ?? 0,
    categories: categories.count ?? 0,
    ordersOpen: ordersOpen.count ?? 0,
  };
}

/** Artikel mit wenig Bestand – für die Warnliste im Dashboard. */
export async function getLowStockProducts(limit = 5): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("stock_available")
    .limit(limit);

  if (error) {
    console.error("[admin] Bestandswarnung:", error.message);
    return [];
  }
  return (data ?? []) as Product[];
}

export async function getRecentOrders(limit = 10): Promise<AdminOrderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `*, customer:users (id, email, full_name, company_name),
       items:order_items (id, order_id, product_variant_id, product_name,
                          product_sku, quantity, unit_price, subtotal, created_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] Letzte Bestellungen:", error.message);
    return [];
  }
  return (data ?? []) as unknown as AdminOrderRow[];
}

/**
 * Meistbestellte Artikel. order_items hält den Artikelnamen als Snapshot, die
 * Auswertung funktioniert deshalb auch für inzwischen gelöschte Artikel.
 */
export async function getTopProducts(limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("product_sku, product_name, quantity, subtotal");

  if (error) {
    console.error("[admin] Top-Artikel:", error.message);
    return [];
  }

  const totals = new Map<
    string,
    { sku: string; name: string; quantity: number; revenue: number }
  >();

  for (const row of data ?? []) {
    const key = row.product_sku as string;
    const entry = totals.get(key) ?? {
      sku: key,
      name: row.product_name as string,
      quantity: 0,
      revenue: 0,
    };
    entry.quantity += toNumber(row.quantity as number);
    entry.revenue += toNumber(row.subtotal as number);
    totals.set(key, entry);
  }

  return [...totals.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

export async function getAdminProducts(search?: string): Promise<AdminProductRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(
      `*, category:categories (id, name),
       variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at)`,
    )
    .order("name");

  const term = search?.replace(/[,()*\\%]/g, " ").trim();
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Artikelliste:", error.message);
    return [];
  }
  return (data ?? []) as unknown as AdminProductRow[];
}

export async function getCustomers(): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin] Kundenliste:", error.message);
    return [];
  }
  return (data ?? []) as AppUser[];
}

export async function getAdminOrders(status?: string): Promise<AdminOrderRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      `*, customer:users (id, email, full_name, company_name),
       items:order_items (id, order_id, product_variant_id, product_name,
                          product_sku, quantity, unit_price, subtotal, created_at)`,
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Bestellliste:", error.message);
    return [];
  }
  return (data ?? []) as unknown as AdminOrderRow[];
}

export async function getAdminOrder(id: string): Promise<AdminOrderRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `*, customer:users (id, email, full_name, company_name),
       items:order_items (id, order_id, product_variant_id, product_name,
                          product_sku, quantity, unit_price, subtotal, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin] Bestelldetail:", error.message);
    return null;
  }
  return (data as unknown as AdminOrderRow) ?? null;
}

export async function getAccessRequests(status?: string): Promise<AccessRequest[]> {
  const supabase = await createClient();

  let query = supabase
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Zugangsanfragen:", error.message);
    return [];
  }
  return (data ?? []) as AccessRequest[];
}

export async function getAccessRequest(id: string): Promise<AccessRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin] Zugangsanfrage-Detail:", error.message);
    return null;
  }
  return (data as AccessRequest) ?? null;
}
