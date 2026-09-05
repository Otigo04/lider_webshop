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
  /** EAN/UPC vom Etikett – was der Kassenscanner liest. null, solange keiner erfasst ist */
  barcode: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_new: boolean;
  is_topseller: boolean;
  /** Folgt automatisch product_images (Trigger, Migration 020) – kein manueller Schalter. */
  has_image: boolean;
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

/**
 * Frei definierbares Organisations-Flag (Migration 021) – admin-verwaltet,
 * rein intern. Anders als is_new/is_topseller kein Sonderverhalten im Shop.
 */
export interface ProductFlagDef {
  id: string;
  name: string;
  /** Index in die .tag-N-Palette (app/globals.css), 1–6. */
  color: number;
  created_at: string;
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

export type InvoiceStatus = "open" | "paid" | "overdue";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Offen",
  paid: "Bezahlt",
  overdue: "Überfällig",
};

export type InvoiceType = "order" | "manual";

export interface Invoice {
  id: string;
  /** null bei freien Rechnungen ohne Bestellbezug (type "manual") */
  order_id: string | null;
  customer_id: string;
  type: InvoiceType;
  invoice_number: string;
  /** Pfad im Supabase-Storage-Bucket `invoices`, null bis PDF hochgeladen ist */
  file_path: string | null;
  status: InvoiceStatus;
  /** Nur bei freien Rechnungen gepflegt (z. B. "Beratung März 2026") */
  notes: string | null;
  /** Nur bei freien Rechnungen befüllt – Bestellungs-Rechnungen nutzen order.total_amount (netto) */
  net_amount: number | null;
  vat_amount: number;
  total_amount: number | null;
  issued_at: string;
  paid_at: string | null;
  created_at: string;
  /** Nur befüllt, wenn per Join mitgeladen (freie Rechnungen) */
  items?: InvoiceItem[];
  customer?: AppUser;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  /** Prozentsatz: 0, 7 oder 19 */
  vat_rate: number;
  subtotal: number;
  created_at: string;
}

/** Zahlart an der Ladenkasse. Karte oder bar – mehr gibt der Tresen nicht her. */
export type PosPaymentMethod = "cash" | "card";

export const POS_PAYMENT_LABELS: Record<PosPaymentMethod, string> = {
  cash: "Bar",
  card: "Karte",
};

/**
 * Ein abgeschlossener Verkauf über den Tresen. Bewusst getrennt von `orders`:
 * dort hängen Reservierung, Lieferweg und Kundenkonto dran, an der Kasse gibt
 * es nichts davon (siehe supabase/migrations/018_kasse_pos.sql).
 */
export interface PosSale {
  id: string;
  receipt_number: string;
  /** null bei Laufkundschaft ohne Konto */
  customer_id: string | null;
  /** Freitext, wenn ohne Konto verkauft wurde (z. B. "Barverkauf") */
  customer_label: string | null;
  cashier_id: string | null;
  payment_method: PosPaymentMethod;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  note: string | null;
  /** Beleg-PDF im Bucket `invoices` unter pos/<id>/<receipt_number>.pdf */
  file_path: string | null;
  created_at: string;
  items?: PosSaleItem[];
  customer?: AppUser | null;
}

export interface PosSaleItem {
  id: string;
  sale_id: string;
  /** null, wenn der Artikel später gelöscht wurde – die Schnappschüsse bleiben */
  product_id: string | null;
  product_name: string;
  product_sku: string;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

/** Position im Kassen-Warenkorb. Reiner Client-State, nichts davon in der DB. */
export interface PosCartItem {
  /** null bei einer frei eingetragenen Zeile ohne Artikelstamm */
  productId: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  /** Frei verfügbarer Bestand beim Erfassen; null bei freien Zeilen */
  maxStock: number | null;
}

export interface CompanySettings {
  company_name: string | null;
  /** Inhaber – steht in der Rechnungsfußzeile unter dem Firmennamen */
  owner_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string;
  phone: string | null;
  email: string | null;
  /** Ohne Schema gepflegt (www.example.de) */
  website: string | null;
  tax_number: string | null;
  vat_id: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  payment_terms_days: number;
  /** Steuersatz der Ladenkasse – kein fester Wert im Code */
  pos_vat_rate: number;
  /** true = Kassenpreise sind Endpreise inkl. USt., false = netto */
  pos_prices_gross: boolean;
  /** Zusatzzeile unter dem Kassenbon (Öffnungszeiten, Rückgabehinweis) */
  pos_receipt_footer: string | null;
}

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
