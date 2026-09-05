import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import { baseUnitPrice, freeStock, resolveTier } from "@/lib/pricing";
import type {
  AppUser,
  PosSale,
  PosSaleItem,
  ProductVariant,
} from "@/lib/types";

/**
 * Lesezugriffe der Ladenkasse. Alles läuft über den Session-Client, damit RLS
 * greift – die POS-Tabellen sind per Policy auf Admins beschränkt
 * (supabase/migrations/018_kasse_pos.sql).
 */

/** Artikel in der Form, die die Kasse braucht: Preis für ein Stück und Bestand. */
export interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  categoryName: string | null;
  /** Frei verfügbar = Bestand minus Reservierungen offener Onlinebestellungen */
  freeStock: number;
  /** Vorschlagspreis für ein Stück: kleinste Preisstaffel */
  unitPrice: number | null;
  variants: ProductVariant[];
}

const POS_COLUMNS = `
  id, sku, barcode, name, category_id, is_active,
  stock_available, stock_reserved,
  category:categories (id, name),
  variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at)
`;

interface PosProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: string;
  stock_available: number;
  stock_reserved: number;
  category: { id: string; name: string } | null;
  variants: ProductVariant[] | null;
}

function zuPosProdukt(row: PosProductRow): PosProduct {
  const variants = row.variants ?? [];
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    freeStock: freeStock(row),
    unitPrice: baseUnitPrice(variants),
    variants,
  };
}

/**
 * Artikel zu einem Scan finden.
 *
 * Der Scanner liefert den Barcode vom Etikett; getippt wird an der Kasse aber
 * auch mal die eigene Artikelnummer. Deshalb beide Felder, Barcode zuerst –
 * er ist eindeutig, die Suche über die Artikelnummer ist der Notnagel.
 */
export async function findProductByCode(code: string): Promise<PosProduct | null> {
  const gesucht = code.trim();
  if (!gesucht) return null;

  const supabase = await createClient();

  const { data: perBarcode, error } = await supabase
    .from("products")
    .select(POS_COLUMNS)
    .eq("barcode", gesucht)
    .maybeSingle();

  if (error) {
    console.error("[kasse] Barcode-Suche:", error.message);
  }
  if (perBarcode) return zuPosProdukt(perBarcode as unknown as PosProductRow);

  const { data: perSku } = await supabase
    .from("products")
    .select(POS_COLUMNS)
    .eq("sku", gesucht)
    .maybeSingle();

  return perSku ? zuPosProdukt(perSku as unknown as PosProductRow) : null;
}

/** Freitextsuche für den Fall, dass ein Etikett nicht lesbar ist. */
export async function searchPosProducts(term: string, limit = 12): Promise<PosProduct[]> {
  // Zeichen mit Sonderbedeutung im PostgREST-Filter und in LIKE raus, sonst
  // zerlegt ein Komma oder eine Klammer im Suchwort den Ausdruck.
  const gesucht = term.replace(/[,()*\\%"]/g, " ").trim();
  if (gesucht.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(POS_COLUMNS)
    .eq("is_active", true)
    .or(`name.ilike.%${gesucht}%,sku.ilike.%${gesucht}%,barcode.ilike.%${gesucht}%`)
    .order("name")
    .limit(limit);

  if (error) {
    console.error("[kasse] Artikelsuche:", error.message);
    return [];
  }
  return (data ?? []).map((row) => zuPosProdukt(row as unknown as PosProductRow));
}

/** Preis für eine Menge – an der Kasse gelten dieselben Staffeln wie im Shop. */
export function posUnitPrice(product: PosProduct, quantity: number): number {
  const tier = resolveTier(product.variants, quantity);
  if (tier) return toNumber(tier.unit_price);
  return product.unitPrice ?? 0;
}

// --- Verkäufe ---------------------------------------------------------------

export interface PosSaleFilters {
  /** ISO-Datum (YYYY-MM-DD), inklusive */
  from?: string;
  /** ISO-Datum (YYYY-MM-DD), inklusive – wird intern auf den Tagesanfang danach gesetzt */
  to?: string;
  /** Belegnummer, Artikelname oder Artikelnummer */
  search?: string;
  payment?: "cash" | "card";
  limit?: number;
}

export interface PosSaleListItem extends PosSale {
  items: PosSaleItem[];
  customer: AppUser | null;
}

/**
 * Verkaufshistorie. Positionen kommen mit, weil die Liste danach filtern soll
 * ("welche Bons enthielten Artikel X") und eine zweite Runde pro Zeile teurer
 * wäre als der eine Join.
 */
export async function getPosSales(
  filters: PosSaleFilters = {},
): Promise<PosSaleListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("pos_sales")
    .select("*, items:pos_sale_items (*), customer:users!pos_sales_customer_id_fkey (*)")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) {
    // Bis einschließlich dieses Tages: der Vergleich läuft gegen den Anfang
    // des Folgetags, sonst fielen alle Verkäufe nach 00:00 Uhr heraus.
    const bis = new Date(`${filters.to}T00:00:00`);
    bis.setDate(bis.getDate() + 1);
    query = query.lt("created_at", bis.toISOString());
  }
  if (filters.payment) query = query.eq("payment_method", filters.payment);

  const { data, error } = await query;
  if (error) {
    console.error("[kasse] Verkäufe laden:", error.message);
    return [];
  }

  const sales = (data ?? []) as unknown as PosSaleListItem[];
  const term = filters.search?.trim().toLowerCase();
  if (!term) return sales;

  // Die Volltextsuche über Positionen läuft bewusst in der Anwendung: über
  // PostgREST wäre das ein Filter auf der eingebetteten Tabelle, der die
  // Bons ohne Treffer nicht ausblendet, sondern nur deren Positionen leert.
  return sales.filter(
    (sale) =>
      sale.receipt_number.toLowerCase().includes(term) ||
      (sale.customer_label ?? "").toLowerCase().includes(term) ||
      (sale.customer?.company_name ?? "").toLowerCase().includes(term) ||
      (sale.customer?.full_name ?? "").toLowerCase().includes(term) ||
      (sale.items ?? []).some(
        (item) =>
          item.product_name.toLowerCase().includes(term) ||
          item.product_sku.toLowerCase().includes(term) ||
          (item.barcode ?? "").toLowerCase().includes(term),
      ),
  );
}

export async function getPosSale(id: string): Promise<PosSaleListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_sales")
    .select("*, items:pos_sale_items (*), customer:users!pos_sales_customer_id_fkey (*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[kasse] Verkauf laden:", error.message);
    return null;
  }
  return (data as unknown as PosSaleListItem) ?? null;
}

export interface PosSummary {
  salesCount: number;
  netTotal: number;
  grossTotal: number;
}

/** Kennzahlen für einen Zeitraum. Summiert die Datenbank, nicht die Seite. */
export async function getPosSummary(from: Date, to: Date): Promise<PosSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_summary", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) {
    console.error("[kasse] Kennzahlen:", error.message);
    return { salesCount: 0, netTotal: 0, grossTotal: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { sales_count: number; net_total: number; gross_total: number }
    | undefined;

  return {
    salesCount: Number(row?.sales_count ?? 0),
    netTotal: toNumber(row?.net_total),
    grossTotal: toNumber(row?.gross_total),
  };
}

/** Heutiger Umsatz – Tagesgrenzen in Ortszeit, nicht in UTC. */
export async function getPosToday(): Promise<PosSummary> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const ende = new Date(start);
  ende.setDate(ende.getDate() + 1);
  return getPosSummary(start, ende);
}

export interface PosTopProduct {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
}

/**
 * Meistverkaufte Artikel an der Kasse, seit `tage` Tagen. Die Summierung läuft
 * in der Anwendung: für die Stückzahlen eines Ladens ist das nichts, und eine
 * eigene DB-Funktion dafür wäre mehr Wartung als Nutzen.
 */
export async function getPosTopProducts(
  limit = 5,
  tage = 30,
): Promise<PosTopProduct[]> {
  const supabase = await createClient();
  const seit = new Date();
  seit.setDate(seit.getDate() - tage);

  const { data, error } = await supabase
    .from("pos_sale_items")
    .select("product_sku, product_name, quantity, subtotal, sale:pos_sales!inner (created_at)")
    .gte("sale.created_at", seit.toISOString());

  if (error) {
    console.error("[kasse] Meistverkauft:", error.message);
    return [];
  }

  const summen = new Map<string, PosTopProduct>();
  for (const row of data ?? []) {
    const sku = row.product_sku as string;
    const eintrag = summen.get(sku) ?? {
      sku,
      name: row.product_name as string,
      quantity: 0,
      revenue: 0,
    };
    eintrag.quantity += toNumber(row.quantity);
    eintrag.revenue += toNumber(row.subtotal);
    summen.set(sku, eintrag);
  }

  return [...summen.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}
