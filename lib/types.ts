/**
 * Domain-Typen für den Lider Großhandel Shop.
 * Spiegelt supabase/schema.sql. Änderungen bitte in beiden Dateien nachziehen.
 */

export type UserRole = "admin" | "customer";

export type OrderStatus =
  | "draft"
  | "submitted"
  | "confirmed"
  | "shipped"
  | "delivered";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Entwurf",
  submitted: "Eingegangen",
  confirmed: "Bestätigt",
  shipped: "Versandt",
  delivered: "Geliefert",
};

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  order_index: number;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  min_quantity: number;
  /** null = offene Staffel nach oben ("200+") */
  max_quantity: number | null;
  /** DECIMAL(10,2) – kommt als string über PostgREST, siehe toNumber() in lib/format.ts */
  unit_price: number;
  stock_available: number;
  stock_reserved: number;
  created_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  /** Pfad im Supabase-Storage-Bucket `products`, nicht die volle URL */
  file_path: string;
  display_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  sku: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Nur befüllt, wenn per Join/Select mitgeladen */
  variants?: ProductVariant[];
  images?: ProductImage[];
  category?: Category;
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  /** null, wenn die Variante später gelöscht wurde – Snapshot-Felder bleiben */
  product_variant_id: string | null;
  /** Snapshot zum Bestellzeitpunkt, damit Historie stabil bleibt */
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  delivery_address: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  customer?: AppUser;
}

/** Warenkorb-Position (nur Client-State, nicht in der DB) */
export interface CartItem {
  productId: string;
  productName: string;
  productSku: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
}
