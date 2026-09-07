"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { orderStatusChangedEmail } from "@/lib/emails/order-status-changed";
import { orderReadyEmail } from "@/lib/emails/order-ready";
import { getAdminOrder } from "@/lib/queries/admin";
import { getCompanySettings } from "@/lib/queries/settings";
import { INVOICE_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/types";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import type { Order } from "@/lib/types";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "draft",
    "submitted",
    "confirmed",
    "ready",
    "shipped",
    "delivered",
  ]),
});

/**
 * Abholbereit-Mail an den Kunden. Getrennt von der allgemeinen Statusmail,
 * weil hier mehr drinsteht als der neue Status: Abholanschrift, notierter
 * Wunschtermin und der offene Betrag. Fehler landen nur im Log – eine
 * gescheiterte Mail darf den Status nicht zurückdrehen.
 */
async function sendeAbholmail(orderId: string): Promise<boolean> {
  const [order, company] = await Promise.all([
    getAdminOrder(orderId),
    getCompanySettings(),
  ]);

  if (!order?.customer?.email) return false;

  try {
    const mail = orderReadyEmail(order, company);
    await sendEmail({ to: order.customer.email, ...mail });
    return true;
  } catch (err) {
    console.error("[admin] Abholmail fehlgeschlagen:", err);
    return false;
  }
}

/**
 * Kunde erneut benachrichtigen, dass die Ware bereitliegt – etwa wenn die
 * erste Mail im Spam gelandet ist. Ändert nichts am Status.
 */
export async function notifyOrderReady(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Ungültige Bestellung." };

  const verschickt = await sendeAbholmail(id.data);
  return verschickt
    ? { success: "Benachrichtigung verschickt." }
    : { error: "Die Benachrichtigung konnte nicht verschickt werden." };
}

export async function updateOrderStatus(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Ungültiger Status." };
  }

  const supabase = await createClient();

  /*
   * "Abholbereit" ist mehr als ein Status: der Zeitpunkt der Meldung gehört
   * mit an die Bestellung, weil er in der Benachrichtigung steht. Beides
   * zusammen setzt mark_order_ready() (Migration 029).
   */
  const abholbereit = parsed.data.status === "ready";

  const { data, error } = abholbereit
    ? await supabase.rpc("mark_order_ready", { p_order_id: parsed.data.id })
    : await supabase
        .from("orders")
        .update({ status: parsed.data.status })
        .eq("id", parsed.data.id)
        .select("*, customer:users (id, email, full_name, company_name)")
        .single();

  if (error) {
    console.error("[admin] Status ändern:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.id}`);

  // Mailversand darf eine bereits gespeicherte Statusänderung nie rückgängig
  // machen – Fehler landen nur im Log.
  if (abholbereit) {
    await sendeAbholmail(parsed.data.id);
    return { success: "Als abholbereit gemeldet, Kunde benachrichtigt." };
  }

  try {
    const order = data as unknown as Order;
    if (order.customer?.email) {
      const mail = orderStatusChangedEmail(order, parsed.data.status);
      await sendEmail({ to: order.customer.email, ...mail });
    }
  } catch (err) {
    console.error("[admin] Status-Mail fehlgeschlagen:", err);
  }

  return {
    success: `Status auf „${ORDER_STATUS_LABELS[parsed.data.status]}“ gesetzt.`,
  };
}

const invoiceStatusSchema = z.object({
  id: z.string().uuid(),
  // Nur bei Bestellungs-Rechnungen gesetzt – freie Rechnungen haben keine
  // Bestellung, siehe supabase/migrations/016_firmendaten_und_rechnungen.sql.
  orderId: z.string().uuid().optional(),
  status: z.enum(["open", "paid", "overdue"]),
});

export async function updateInvoiceStatus(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = invoiceStatusSchema.safeParse({
    id: formData.get("id"),
    orderId: formData.get("orderId") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Ungültiger Status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      status: parsed.data.status,
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] Rechnungsstatus ändern:", error.message);
    return { error: "Der Rechnungsstatus konnte nicht geändert werden." };
  }

  if (parsed.data.orderId) {
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    revalidatePath(`/orders/${parsed.data.orderId}`);
  } else {
    revalidatePath(`/kasse/rechnungen/${parsed.data.id}`);
  }
  revalidatePath("/kasse/rechnungen");
  return {
    success: `Rechnungsstatus auf „${INVOICE_STATUS_LABELS[parsed.data.status]}“ gesetzt.`,
  };
}
