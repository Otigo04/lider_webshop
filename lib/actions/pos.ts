"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { INVOICE_BUCKET } from "@/lib/constants";
import { buildPosReceiptPdfData, generateInvoicePdf } from "@/lib/invoice";
import { getCompanySettings } from "@/lib/queries/settings";
import {
  findProductByCode,
  getPosSale,
  searchPosProducts,
  type PosProduct,
} from "@/lib/queries/pos";
import { getInvoiceUrl } from "@/lib/storage";
import type { AppUser, PosSale } from "@/lib/types";

/**
 * Server Actions der Ladenkasse.
 *
 * Die Kassenoberfläche ist eine Client-Komponente und ruft diese Funktionen
 * direkt auf – kein eigener Route Handler, keine offene API. Jede Funktion
 * beginnt mit requireAdmin(): der Scanner steht im Laden, aber die Actions
 * sind über das Netz erreichbar.
 */

export interface PosLookupResult {
  product: PosProduct | null;
  /** Der gesuchte Code, damit die Oberfläche ihn im Anlege-Dialog vorbelegen kann */
  code: string;
}

/** Einen Scan auflösen. Kein Treffer ist ein normaler Fall, kein Fehler. */
export async function lookupPosProduct(code: string): Promise<PosLookupResult> {
  await requireAdmin();
  const sauber = code.trim().slice(0, 64);
  if (!sauber) return { product: null, code: "" };

  return { product: await findProductByCode(sauber), code: sauber };
}

/**
 * Freitextsuche, wenn das Etikett nicht lesbar ist.
 *
 * 50 statt der Voreinstellung: an der Kasse wird oft nach einer Marke gesucht,
 * und ein Dutzend Treffer schneidet die Hälfte des Sortiments ab. Die Liste
 * klappt über die Seite und scrollt, mehr Treffer kosten also keinen Platz.
 */
const SUCHTREFFER = 50;

export async function searchPosProductsAction(term: string): Promise<PosProduct[]> {
  await requireAdmin();
  return searchPosProducts(term.slice(0, 80), SUCHTREFFER);
}

// --- Artikel direkt an der Kasse anlegen -------------------------------------

const quickProductSchema = z.object({
  name: z.string().trim().min(1, "Bezeichnung fehlt").max(200),
  barcode: z.string().trim().max(64).optional(),
  category_id: z.string().uuid("Kategorie fehlt"),
  unit_price: z.coerce
    .number({ message: "Preis fehlt" })
    .min(0, "Preis darf nicht negativ sein")
    .max(1_000_000),
  stock_available: z.coerce
    .number({ message: "Bestand fehlt" })
    .int("Bestand muss eine ganze Zahl sein")
    .min(0, "Bestand darf nicht negativ sein")
    .max(10_000_000),
});

export interface QuickProductResult {
  error?: string;
  product?: PosProduct;
}

/**
 * Artikel anlegen, wenn ein Scan ins Leere läuft.
 *
 * Bewusst reduziert auf das, was am Tresen bekannt ist: Bezeichnung, Barcode,
 * Preis, Warengruppe, Bestand. Fotos und Beschreibung kommen später über die
 * Artikelverwaltung dazu. Die Artikelnummer zieht wie überall der
 * Nummernkreis der Kategorie (RPC next_sku).
 */
export async function createQuickProduct(
  input: z.input<typeof quickProductSchema>,
): Promise<QuickProductResult> {
  const admin = await requireAdmin();

  const parsed = quickProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const daten = parsed.data;
  const barcode = daten.barcode?.trim() || null;

  const supabase = await createClient();

  if (barcode) {
    const { data: schonDa } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", barcode)
      .maybeSingle();
    if (schonDa) {
      return { error: `Der Barcode ${barcode} ist bereits vergeben.` };
    }
  }

  const { data: sku, error: skuError } = await supabase.rpc("next_sku", {
    p_category_id: daten.category_id,
  });
  if (skuError || !sku) {
    console.error("[kasse] Artikelnummer:", skuError?.message);
    return { error: "Es konnte keine Artikelnummer vergeben werden." };
  }

  const { data: angelegt, error: insertError } = await supabase
    .from("products")
    .insert({
      category_id: daten.category_id,
      sku: sku as string,
      barcode,
      name: daten.name,
      is_active: true,
      stock_available: daten.stock_available,
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (insertError || !angelegt) {
    console.error("[kasse] Artikel anlegen:", insertError?.message);
    return {
      error:
        insertError?.code === "23505"
          ? "Artikelnummer oder Barcode sind bereits vergeben. Bitte erneut versuchen."
          : "Der Artikel konnte nicht angelegt werden.",
    };
  }

  // Eine Staffel ab 1 Stück: ohne Preisstaffel hätte der Artikel im Shop
  // keinen Preis und wäre dort nicht bestellbar.
  const { error: tierError } = await supabase.from("product_variants").insert({
    product_id: angelegt.id as string,
    min_quantity: 1,
    max_quantity: null,
    unit_price: daten.unit_price,
  });
  if (tierError) {
    console.error("[kasse] Preis anlegen:", tierError.message);
    return { error: "Der Artikel wurde angelegt, aber ohne Preis." };
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");

  const product = await findProductByCode(barcode ?? (sku as string));
  if (!product) {
    return { error: "Der Artikel wurde angelegt, konnte aber nicht geladen werden." };
  }
  return { product };
}

// --- Verkauf abschließen -----------------------------------------------------

const saleItemSchema = z.object({
  productId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(60),
  barcode: z.string().trim().max(64).nullable(),
  quantity: z.number().int().positive().max(100_000),
  unitPrice: z.number().min(0).max(1_000_000),
});

const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Der Bon ist leer."),
  customerId: z.string().uuid().nullable(),
  customerLabel: z.string().trim().max(160).nullable(),
  paymentMethod: z.enum(["cash", "card"]),
  note: z.string().trim().max(500).nullable(),
});

export interface CompleteSaleResult {
  error?: string;
  sale?: {
    id: string;
    receiptNumber: string;
    netAmount: number;
    vatAmount: number;
    totalAmount: number;
    /** Signierte URL des Beleg-PDFs; null, wenn die Erzeugung scheiterte */
    receiptUrl: string | null;
  };
}

/**
 * Verkauf buchen.
 *
 * Der eigentliche Vorgang – Bestand prüfen, abbuchen, Positionen schreiben,
 * Summen rechnen – läuft vollständig in create_pos_sale() in der Datenbank.
 * Nur so ist er atomar: sonst könnte zwischen Bestandsprüfung und Abbuchung
 * eine Onlinebestellung dazwischenfunken.
 *
 * Das Beleg-PDF entsteht danach. Scheitert es, ist der Verkauf trotzdem
 * gebucht – der Bon lässt sich in der Verkaufshistorie nachträglich erzeugen.
 */
export async function completePosSale(
  input: z.input<typeof saleSchema>,
): Promise<CompleteSaleResult> {
  await requireAdmin();

  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const daten = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pos_sale", {
    p_items: daten.items.map((item) => ({
      product_id: item.productId,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
    p_customer_id: daten.customerId,
    p_customer_label: daten.customerLabel,
    p_payment_method: daten.paymentMethod,
    p_note: daten.note,
  });

  if (error || !data) {
    console.error("[kasse] Verkauf buchen:", error?.message);
    return {
      // Die Meldungen aus der Datenbank sind hier bewusst durchgereicht:
      // "Von X sind nur noch 3 Stück verfügbar" ist genau das, was an der
      // Kasse gebraucht wird.
      error: error?.message ?? "Der Verkauf konnte nicht gebucht werden.",
    };
  }

  const sale = data as unknown as PosSale;
  const receiptUrl = await erzeugeBeleg(sale.id);

  revalidatePath("/admin/sales");
  revalidatePath("/admin");
  revalidatePath("/admin/products");

  return {
    sale: {
      id: sale.id,
      receiptNumber: sale.receipt_number,
      netAmount: Number(sale.net_amount),
      vatAmount: Number(sale.vat_amount),
      totalAmount: Number(sale.total_amount),
      receiptUrl,
    },
  };
}

/**
 * Beleg-PDF erzeugen, hochladen und signierte URL zurückgeben.
 *
 * Upload über den Service-Key: der invoices-Bucket ist auch für Admins nicht
 * beschreibbar (siehe migrations/015_rechnungen.sql), Schreibrechte hat nur
 * der Server.
 */
async function erzeugeBeleg(saleId: string): Promise<string | null> {
  try {
    const sale = await getPosSale(saleId);
    if (!sale) return null;

    const company = await getCompanySettings();
    const pdfBytes = await generateInvoicePdf(
      buildPosReceiptPdfData(
        sale,
        sale.items ?? [],
        (sale.customer as AppUser | null) ?? null,
        company,
        company.pos_prices_gross,
      ),
    );

    const filePath = `pos/${saleId}/${sale.receipt_number}.pdf`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(INVOICE_BUCKET)
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[kasse] Beleg hochladen:", uploadError.message);
      return null;
    }

    await admin.from("pos_sales").update({ file_path: filePath }).eq("id", saleId);
    return getInvoiceUrl(filePath);
  } catch (fehler) {
    console.error("[kasse] Beleg erzeugen:", fehler);
    return null;
  }
}

/** Beleg zu einem bereits gebuchten Verkauf holen oder nachträglich erzeugen. */
export async function getPosReceiptUrl(saleId: string): Promise<string | null> {
  await requireAdmin();

  const sale = await getPosSale(saleId);
  if (!sale) return null;
  if (sale.file_path) return getInvoiceUrl(sale.file_path);
  return erzeugeBeleg(saleId);
}
