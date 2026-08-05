import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";

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
  delivery_address, created_at, updated_at,
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
