"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { erzeugeStornoRechnung } from "@/lib/storno-erzeugen";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Rechnung stornieren (Migration 064). cancel_invoice() vergibt in der
 * Datenbank die Stornonummer und setzt Rechnung und Bestellung auf
 * „storniert“; danach entsteht das PDF. Eine Stornierung lässt sich nicht
 * zurücknehmen.
 */

const schema = z.object({
  invoice_id: z.string().uuid("Keine Rechnung ausgewählt."),
  reason: z.string().trim().max(300, "Höchstens 300 Zeichen").optional(),
  mail: z.boolean(),
});

function neuLaden(invoiceId: string, orderId: string | null) {
  revalidatePath("/kasse/rechnungen");
  revalidatePath(`/kasse/rechnungen/${invoiceId}`);
  revalidatePath("/admin/orders");
  if (orderId) {
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}`);
  }
  revalidatePath("/orders");
}

export async function stornoRechnung(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    invoice_id: formData.get("invoice_id"),
    reason: formData.get("reason") || undefined,
    mail: formData.get("mail") === "1",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_invoice", {
    p_invoice_id: parsed.data.invoice_id,
    p_reason: parsed.data.reason ?? null,
  });
  if (error || !data) {
    console.error("[storno] cancel_invoice:", error?.message);
    return { error: error?.message || "Die Rechnung konnte nicht storniert werden." };
  }
  const rechnung = data as { order_id: string | null; storno_number: string };

  const pdf = await erzeugeStornoRechnung(parsed.data.invoice_id, { mail: parsed.data.mail });
  neuLaden(parsed.data.invoice_id, rechnung.order_id);

  if (!pdf.ok) {
    return {
      success: `Rechnung storniert (${rechnung.storno_number}). Das PDF fehlt noch: ${pdf.error} Du kannst es auf der Rechnung neu erzeugen.`,
    };
  }
  return {
    success: `Rechnung storniert (${rechnung.storno_number}).${
      parsed.data.mail ? (pdf.email ? " Mail an den Kunden ist raus." : " Die Mail ging nicht raus.") : ""
    }`,
  };
}

/** PDF der Stornorechnung nachträglich (neu) erzeugen – ohne Mail. */
export async function stornoPdfNeu(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("invoice_id"));
  if (!id.success) return { error: "Keine Rechnung ausgewählt." };

  const pdf = await erzeugeStornoRechnung(id.data, { mail: false });
  if (!pdf.ok) return { error: pdf.error };
  neuLaden(id.data, null);
  return { success: "PDF der Stornorechnung erzeugt." };
}
