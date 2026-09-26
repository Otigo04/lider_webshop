import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Invoice, Order, OrderItem, OrderStatus } from "@/lib/types";

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
