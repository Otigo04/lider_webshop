"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { orderStatusChangedEmail } from "@/lib/emails/order-status-changed";
import { INVOICE_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/types";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import type { Order } from "@/lib/types";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "submitted", "confirmed", "shipped", "delivered"]),
});

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
  const { data, error } = await supabase
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

  // Mailversand darf eine bereits gespeicherte Statusänderung nie rückgängig
  // machen – Fehler landen nur im Log.
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
