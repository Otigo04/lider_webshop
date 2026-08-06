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

export type DeliveryMethod = "pickup" | "shipping";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  order_index: number;
  /** Zweistelliger Nummernkreis für Artikelnummern, z. B. "12" → 12-0001 */
  sku_prefix: string | null;
  created_at: string;
}

/**
 * Nur die Felder, die für die Preisberechnung gebraucht werden. So lässt sich
 * dieselbe Logik (lib/pricing.ts) auf DB-Zeilen und auf die abgespeckten
 * Staffeln im Warenkorb anwenden.
 */
export interface PriceTier {
  id: string;
  min_quantity: number;
  /** null = offene Staffel nach oben ("200+") */
  max_quantity: number | null;
  /** DECIMAL(10,2) – kommt als string über PostgREST, siehe toNumber() in lib/format.ts */
  unit_price: number;
}

/** Eine Preisstaffel wie sie in der DB steht. Der Bestand hängt am Produkt. */
export interface ProductVariant extends PriceTier {
  product_id: string;
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
  stock_available: number;
  stock_reserved: number;
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
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  billing_country: string | null;
  shipping_street: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
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
  /** Reiner Warenwert netto. Versandkosten sind nicht enthalten. */
  total_amount: number;
  notes: string | null;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  customer?: AppUser;
}

/**
 * Warenkorb-Position. Reiner Client-State im localStorage, nicht in der DB.
 *
 * Die Staffeln liegen bewusst mit in der Position: ändert der Kunde im Warenkorb
 * die Menge, muss der Stückpreis sofort auf die passende Staffel springen. Ein
 * eingefrorener `unitPrice` wäre nach jeder Mengenänderung falsch.
 *
 * Diese Werte sind vom Client manipulierbar. Beim Bestellen (Phase 4) rechnet
 * der Server alles gegen die DB neu – hier steht nur die Anzeige.
 */
export interface CartItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  tiers: PriceTier[];
  /** Frei verfügbarer Bestand zum Zeitpunkt des Hinzufügens */
  maxStock: number;
}

export type AccessRequestStatus = "new" | "contacted" | "done";

export const ACCESS_REQUEST_STATUS_LABELS: Record<AccessRequestStatus, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  done: "Erledigt",
};

export interface AccessRequest {
  id: string;
  company_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  billing_street: string;
  billing_zip: string;
  billing_city: string;
  billing_country: string;
  shipping_street: string;
  shipping_zip: string;
  shipping_city: string;
  shipping_country: string;
  message: string | null;
  status: AccessRequestStatus;
  created_at: string;
}
