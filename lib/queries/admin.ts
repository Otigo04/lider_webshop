import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import type {
  AccessRequest,
  AppUser,
  Invoice,
  InvoiceItem,
  Order,
  OrderItem,
  Product,
  ProductFlagDef,
  ProductVariant,
} from "@/lib/types";

/**
 * Datenzugriffe für das Admin-Panel. Läuft über den Session-Client: die
 * *_admin_all-Policies geben Admins Vollzugriff, ein Kunde bekommt hier nichts
 * zu sehen. Der Service-Key wird nur dort gebraucht, wo Konten angelegt oder
 * gelöscht werden (lib/actions/admin-customers.ts).
 */

export interface AdminProductRow extends Omit<Product, "category" | "group"> {
  category: { id: string; name: string } | null;
  /** Angebot, zu dem der Artikel als Ausführung gehört (Migration 033) */
  group: { id: string; name: string } | null;
  variants: ProductVariant[];
  flags: ProductFlagDef[];
}

export interface AdminOrderRow extends Omit<Order, "customer"> {
  customer: Pick<AppUser, "id" | "email" | "full_name" | "company_name"> | null;
  items: OrderItem[];
  /**
   * Rechnung zur Bestellung, sofern bereits gestellt. PostgREST liefert die
   * Einbettung als Liste (invoices.order_id ist nur über einen partiellen
   * Index eindeutig); fachlich gibt es höchstens eine – siehe
   * create_invoice_for_order, Migration 024.
   */
  invoices?: Pick<Invoice, "id" | "invoice_number" | "status">[];
}

/** Die eine Rechnung einer Bestellung, oder null. */
export function orderInvoice(
  order: AdminOrderRow,
): Pick<Invoice, "id" | "invoice_number" | "status"> | null {
  return order.invoices?.[0] ?? null;
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

const FIXED_FLAGS = ["is_new", "is_topseller"] as const;

export interface AdminProductFilter {
  search?: string;
  /** Nur Artikel ohne Foto (= automatisch nicht im Shop, Migration 020). */
  ohneBild?: boolean;
  /** Nur ausgeblendete Artikel (is_active = false). */
  inaktiv?: boolean;
  /**
   * ODER-verknüpft: gemischt aus den festen Flags ("is_new"/"is_topseller")
   * und UUIDs frei definierter Flags (Migration 021).
   */
  flagIds?: string[];
  /**
   * Reihenfolge der Liste. "name" ist die Vorgabe – wer einen bestimmten
   * Artikel sucht, sucht ihn alphabetisch. "neu" dreht das um: was zuletzt
   * angelegt wurde, steht oben. Genau das braucht man nach einer Lieferung,
   * um zu prüfen, was gerade hereingekommen ist.
   */
  sort?: AdminProductSort;
}

/** Sortierungen der Artikelliste; die Werte stehen so in der Adresszeile. */
export const ADMIN_PRODUCT_SORT = ["name", "neu", "alt"] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORT)[number];

export const ADMIN_PRODUCT_SORT_LABELS: Record<AdminProductSort, string> = {
  name: "Name A–Z",
  neu: "Neueste zuerst",
  alt: "Älteste zuerst",
};

export function istAdminProductSort(wert: unknown): wert is AdminProductSort {
  return (
    typeof wert === "string" &&
    (ADMIN_PRODUCT_SORT as readonly string[]).includes(wert)
  );
}

export async function getAdminProducts(
  filter?: AdminProductFilter,
): Promise<AdminProductRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(
      `*, category:categories (id, name),
       group:product_groups (id, name),
       variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at),
       flag_links:product_flag_links (flag:product_flags (id, name, color, created_at))`,
    );

  // Sortiert wird in der Abfrage und nicht nachträglich: anders als die
  // Schnellfilter (lib/admin-product-filter.ts) braucht die Reihenfolge kein
  // Feld, das erst gerechnet werden müsste – created_at steht in der Zeile.
  query =
    filter?.sort === "neu"
      ? query.order("created_at", { ascending: false })
      : filter?.sort === "alt"
        ? query.order("created_at", { ascending: true })
        : query.order("name");

  const term = filter?.search?.replace(/[,()*\\%]/g, " ").trim();
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  if (filter?.ohneBild) {
    query = query.eq("has_image", false);
  }
  if (filter?.inaktiv) {
    query = query.eq("is_active", false);
  }

  const gewaehlt = filter?.flagIds ?? [];
  if (gewaehlt.length > 0) {
    const istFixesFlag = (f: string): f is (typeof FIXED_FLAGS)[number] =>
      (FIXED_FLAGS as readonly string[]).includes(f);
    const fixeFlags = gewaehlt.filter(istFixesFlag);
    const eigeneFlagIds = gewaehlt.filter((f) => !istFixesFlag(f));

    const bedingungen = fixeFlags.map((flag) => `${flag}.eq.true`);

    if (eigeneFlagIds.length > 0) {
      const { data: verknuepft } = await supabase
        .from("product_flag_links")
        .select("product_id")
        .in("flag_id", eigeneFlagIds);
      const produktIds = [...new Set((verknuepft ?? []).map((v) => v.product_id as string))];
      // Kein Treffer bei den eigenen Flags: eine unerfüllbare Bedingung statt
      // die .or()-Kette leer zu lassen, sonst würde is_new/is_topseller allein
      // wieder alle Artikel durchlassen statt keinen.
      bedingungen.push(`id.in.(${produktIds.length > 0 ? produktIds.join(",") : "00000000-0000-0000-0000-000000000000"})`);
    }

    if (bedingungen.length > 0) {
      query = query.or(bedingungen.join(","));
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Artikelliste:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const { flag_links, ...rest } = row as unknown as AdminProductRow & {
      flag_links: { flag: ProductFlagDef | null }[];
    };
    return {
      ...rest,
      flags: (flag_links ?? [])
        .map((link) => link.flag)
        .filter((flag): flag is ProductFlagDef => flag !== null),
    };
  });
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

export async function getAdminOrders(
  status?: string,
  sort?: "date" | "customer",
): Promise<AdminOrderRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      `*, customer:users (id, email, full_name, company_name),
       items:order_items (id, order_id, product_variant_id, product_name,
                          product_sku, quantity, unit_price, subtotal, created_at),
       invoices (id, invoice_number, status)`,
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Bestellliste:", error.message);
    return [];
  }
  const orders = (data ?? []) as unknown as AdminOrderRow[];

  // Supabase kann nicht sauber nach Spalten der gejointen Tabelle sortieren –
  // bei "customer" wird deshalb nach dem Laden in JS sortiert.
  if (sort === "customer") {
    return [...orders].sort((a, b) =>
      (a.customer?.company_name || a.customer?.full_name || "").localeCompare(
        b.customer?.company_name || b.customer?.full_name || "",
        "de",
      ),
    );
  }

  return orders;
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

export interface AdminInvoiceRow extends Omit<Invoice, "customer"> {
  customer: Pick<AppUser, "id" | "email" | "full_name" | "company_name"> | null;
  // Nur bei type "order" gesetzt – liefert Bestellnummer und Betrag, weil
  // Bestellungs-Rechnungen ihre Summe nicht selbst tragen (siehe net_amount/
  // total_amount in Invoice, nur für freie Rechnungen befüllt).
  order: { order_number: string; total_amount: number } | null;
}

/**
 * Alle Rechnungen (Katalog-Bestellungen und freie Rechnungen zusammen) für
 * die Übersicht unter /kasse/rechnungen.
 */
export async function getAdminInvoices(options?: {
  search?: string;
  type?: "order" | "manual";
  status?: string;
}): Promise<AdminInvoiceRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(
      `*, customer:users (id, email, full_name, company_name),
       order:orders (order_number, total_amount)`,
    )
    .order("issued_at", { ascending: false });

  if (options?.type) query = query.eq("type", options.type);
  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Rechnungsliste:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as AdminInvoiceRow[];
  const term = options?.search?.trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) =>
    [row.invoice_number, row.customer?.company_name, row.customer?.full_name]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term)),
  );
}

export interface ManualInvoiceRow extends Omit<Invoice, "customer"> {
  customer: AppUser;
  items: InvoiceItem[];
}

/** Eine freie Rechnung inkl. Positionen und Kunde, für /kasse/rechnungen/[id]. */
export async function getManualInvoice(id: string): Promise<ManualInvoiceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(`*, customer:users (*), items:invoice_items (*)`)
    .eq("id", id)
    .eq("type", "manual")
    .maybeSingle();

  if (error) {
    console.error("[admin] Rechnungsdetail:", error.message);
    return null;
  }
  return (data as unknown as ManualInvoiceRow) ?? null;
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
