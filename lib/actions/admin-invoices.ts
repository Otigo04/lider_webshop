"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  generateAndSendManualInvoice,
  generateAndSendOrderInvoice,
} from "@/lib/actions/invoicing";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import type { AppUser } from "@/lib/types";

export interface InvoiceActionState {
  error?: string;
  orderId?: string;
  invoiceId?: string;
}

const catalogItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(1_000_000),
  // Überschreibt die Staffel-Auflösung, wenn gesetzt – siehe create_admin_order
  // in supabase/migrations/016_firmendaten_und_rechnungen.sql.
  unit_price: z.number().min(0).max(1_000_000).optional(),
});

const catalogSchema = z.object({
  customer_id: z.string().uuid("Kein Kunde ausgewählt."),
  items: z.array(catalogItemSchema).min(1, "Mindestens eine Position angeben."),
  notes: z.string().trim().max(2000).optional(),
  delivery_address: z.string().trim().max(500).optional(),
  delivery_method: z.enum(["pickup", "shipping"]).default("pickup"),
});

/**
 * Admin legt eine Bestellung aus dem Katalog für einen Kunden an (z. B.
 * Telefonbestellung). Läuft danach in dieselbe Rechnungs-Pipeline wie der
 * normale Checkout.
 */
export async function createCatalogInvoiceOrder(
  _prevState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  await requireAdmin();

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Die Positionen konnten nicht gelesen werden." };
  }

  const parsed = catalogSchema.safeParse({
    customer_id: formData.get("customer_id"),
    items: rawItems,
    notes: formData.get("notes") || undefined,
    delivery_address: formData.get("delivery_address") || undefined,
    delivery_method: formData.get("delivery_method") || "pickup",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_admin_order", {
    p_customer_id: parsed.data.customer_id,
    p_items: parsed.data.items,
    p_notes: parsed.data.notes ?? null,
    p_delivery_address: parsed.data.delivery_address ?? null,
    p_delivery_method: parsed.data.delivery_method,
  });

  if (error || !data) {
    console.error("[admin] create_admin_order:", error?.message);
    return {
      error: error?.message || "Die Bestellung konnte nicht angelegt werden.",
    };
  }

  const order = data as { id: string; order_number: string };

  const { data: customerRow, error: customerError } = await supabase
    .from("users")
    .select("*")
    .eq("id", parsed.data.customer_id)
    .single();

  if (customerError || !customerRow) {
    console.error("[admin] Kunde laden:", customerError?.message);
  } else {
    try {
      await generateAndSendOrderInvoice(order.id, customerRow as AppUser);
    } catch (err) {
      console.error("[admin] Rechnung/Mailversand fehlgeschlagen:", err);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath("/kasse/rechnungen");
  return { orderId: order.id };
}

/**
 * Rechnung zu einer bestehenden Bestellung nachträglich erzeugen.
 *
 * Nötig für Bestellungen, bei denen die Rechnung beim Anlegen scheiterte –
 * etwa unter dem Fehler, den Migration 024 behebt. Die DB-Funktion gibt eine
 * bereits vorhandene Rechnung unverändert zurück, ein zweiter Klick legt also
 * keine zweite Nummer an.
 */
export async function createOrderInvoice(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  if (!z.string().uuid().safeParse(orderId).success) {
    return { error: "Keine Bestellung ausgewählt." };
  }

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("customer:users (*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order?.customer) {
    console.error("[admin] Bestellung für Rechnung laden:", error?.message);
    return { error: "Die Bestellung konnte nicht geladen werden." };
  }

  try {
    // Bestellbestätigung nicht erneut verschicken – die Bestellung ist alt.
    await generateAndSendOrderInvoice(orderId, order.customer as unknown as AppUser, {
      sendOrderConfirmation: false,
    });
  } catch (err) {
    console.error("[admin] Rechnung nacherzeugen:", err);
    return { error: "Die Rechnung konnte nicht erzeugt werden." };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/kasse/rechnungen");
  return { success: "Rechnung erzeugt und verschickt." };
}

const manualItemSchema = z.object({
  description: z.string().trim().min(1, "Beschreibung fehlt.").max(500),
  quantity: z.number().positive().max(1_000_000),
  unit_price: z.number().min(0).max(1_000_000),
  vat_rate: z.union([z.literal(0), z.literal(7), z.literal(19)]),
});

const manualSchema = z.object({
  customer_id: z.string().uuid("Kein Kunde ausgewählt."),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(manualItemSchema).min(1, "Mindestens eine Position angeben."),
});

/**
 * Freie Rechnung ohne Bestellbezug – Dienstleistung oder Ware außerhalb des
 * Webshop-Katalogs. Summen kommen aus create_manual_invoice, nie vom Client.
 */
export async function createManualInvoice(
  _prevState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  await requireAdmin();

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Die Positionen konnten nicht gelesen werden." };
  }

  const parsed = manualSchema.safeParse({
    customer_id: formData.get("customer_id"),
    notes: formData.get("notes") || undefined,
    items: rawItems,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_manual_invoice", {
    p_customer_id: parsed.data.customer_id,
    p_notes: parsed.data.notes ?? null,
    p_items: parsed.data.items,
  });

  if (error || !data) {
    console.error("[admin] create_manual_invoice:", error?.message);
    return {
      error: error?.message || "Die Rechnung konnte nicht angelegt werden.",
    };
  }

  const invoice = data as { id: string };

  try {
    await generateAndSendManualInvoice(invoice.id);
  } catch (err) {
    console.error("[admin] Rechnung/Mailversand fehlgeschlagen:", err);
  }

  revalidatePath("/kasse/rechnungen");
  return { invoiceId: invoice.id };
}
