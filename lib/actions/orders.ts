"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrder } from "@/lib/queries/orders";
import { generateInvoicePdf } from "@/lib/invoice";
import { sendEmail } from "@/lib/email";
import { orderConfirmationEmail } from "@/lib/emails/order-confirmation";
import { invoiceEmail } from "@/lib/emails/invoice";
import { INVOICE_BUCKET } from "@/lib/constants";
import type { AppUser, Order } from "@/lib/types";

export interface CheckoutState {
  error?: string;
  orderNumber?: string;
}

/**
 * Vom Client kommen nur Artikel-ID und Menge. Preise, Staffeln und Bestände
 * zieht die Datenbankfunktion create_order selbst – siehe
 * supabase/migrations/002_bestellung_anlegen.sql.
 */
const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive().max(1_000_000),
      }),
    )
    .min(1, "Der Warenkorb ist leer."),
  deliveryAddress: z.string().trim().max(500).optional(),
  deliveryMethod: z.enum(["pickup", "shipping"]).default("shipping"),
  notes: z.string().trim().max(2000).optional(),
});

export async function createOrder(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await requireUser("/checkout");

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Der Warenkorb konnte nicht gelesen werden." };
  }

  const parsed = checkoutSchema.safeParse({
    items: rawItems,
    deliveryAddress: formData.get("deliveryAddress") ?? undefined,
    deliveryMethod: formData.get("deliveryMethod") ?? "shipping",
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_items: parsed.data.items,
    p_notes: parsed.data.notes ?? null,
    // Bei Abholung wird keine Adresse gespeichert, auch wenn das Feld
    // vorher ausgefüllt und dann umgeschaltet wurde.
    p_delivery_address:
      parsed.data.deliveryMethod === "pickup"
        ? null
        : (parsed.data.deliveryAddress ?? null),
    p_delivery_method: parsed.data.deliveryMethod,
  });

  if (error) {
    console.error("[bestellung] create_order:", error.message);
    // Die RAISE-EXCEPTION-Texte aus der Funktion sind bewusst kundentauglich
    // formuliert ("Von X sind nur noch 3 Stück verfügbar.") und werden direkt
    // durchgereicht. Bei allem anderen bleibt es bei einer neutralen Meldung.
    return {
      error:
        error.message ||
        "Die Bestellung konnte nicht angelegt werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath("/orders");
  revalidatePath("/shop");

  const created = data as { id: string; order_number: string };

  // Rechnung + Mailversand dürfen eine bereits angelegte Bestellung nie
  // scheitern lassen – Fehler landen nur im Log, der Kunde bekommt seine
  // Bestellbestätigung auf dem Bildschirm in jedem Fall.
  try {
    await generateAndSendInvoice(created.id, user);
  } catch (err) {
    console.error("[bestellung] Rechnung/Mailversand fehlgeschlagen:", err);
  }

  return { orderNumber: created.order_number };
}

async function generateAndSendInvoice(orderId: string, user: AppUser): Promise<void> {
  const order = await getOrder(orderId);
  if (!order) return;

  const fullOrder: Order = { ...order, customer: user };

  const confirmation = orderConfirmationEmail(fullOrder);
  await sendEmail({ to: user.email, ...confirmation });

  const supabase = await createClient();
  const { data: invoiceData, error: invoiceError } = await supabase.rpc(
    "create_invoice_for_order",
    { p_order_id: orderId },
  );

  if (invoiceError || !invoiceData) {
    console.error("[bestellung] create_invoice_for_order:", invoiceError?.message);
    return;
  }

  const invoice = invoiceData as { id: string; invoice_number: string };
  const pdfBytes = await generateInvoicePdf(fullOrder, invoice.invoice_number);
  const filePath = `${orderId}/${invoice.invoice_number}.pdf`;

  // Upload über den Service-Key: Kunden haben bewusst keine Schreibrechte auf
  // den invoices-Bucket (siehe supabase/migrations/015_rechnungen.sql).
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(INVOICE_BUCKET)
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("[bestellung] Rechnungs-Upload:", uploadError.message);
    return;
  }

  await admin.from("invoices").update({ file_path: filePath }).eq("id", invoice.id);

  const invoiceMail = invoiceEmail(fullOrder, invoice.invoice_number);
  await sendEmail({
    to: user.email,
    ...invoiceMail,
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBytes }],
  });
}
