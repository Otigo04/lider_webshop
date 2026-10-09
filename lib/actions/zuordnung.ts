"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Alte Rechnungen und Kassenverkäufe als Bestellung einem Kunden zuordnen
 * (Migration 063). Die Arbeit macht die Datenbank in einer Transaktion
 * (assign_invoice_to_order, assign_pos_sale_to_order); hier steht nur die
 * Prüfung der Eingabe und das Neuladen der Seiten. Für ConfirmAction: die
 * Kennungen reisen als Formularfelder.
 */

const idSchema = z.string().uuid();

function neuLaden(customerId: string) {
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/kasse/rechnungen");
  revalidatePath("/kasse/verkaeufe");
  revalidatePath("/orders");
}

export async function ordneRechnungZu(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const rechnung = idSchema.safeParse(formData.get("invoice_id"));
  const kunde = idSchema.safeParse(formData.get("customer_id"));
  if (!rechnung.success || !kunde.success) {
    return { error: "Rechnung oder Kunde fehlt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_invoice_to_order", {
    p_invoice_id: rechnung.data,
    p_customer_id: kunde.data,
  });
  if (error) {
    console.error("[zuordnung] Rechnung:", error.message);
    // Die Meldungen der Funktion sind für Menschen geschrieben.
    return { error: error.message || "Die Rechnung konnte nicht zugeordnet werden." };
  }

  neuLaden(kunde.data);
  return { success: "Rechnung als Bestellung zugeordnet – der Kunde sieht sie jetzt." };
}

export async function ordneKassenverkaufZu(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const verkauf = idSchema.safeParse(formData.get("sale_id"));
  const kunde = idSchema.safeParse(formData.get("customer_id"));
  if (!verkauf.success || !kunde.success) {
    return { error: "Verkauf oder Kunde fehlt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_pos_sale_to_order", {
    p_sale_id: verkauf.data,
    p_customer_id: kunde.data,
  });
  if (error) {
    console.error("[zuordnung] Kassenverkauf:", error.message);
    return { error: error.message || "Der Verkauf konnte nicht zugeordnet werden." };
  }

  neuLaden(kunde.data);
  return { success: "Verkauf als Bestellung zugeordnet – der Kunde sieht ihn jetzt." };
}
