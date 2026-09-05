"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

const settingsSchema = z.object({
  company_name: z.string().trim().max(160).optional(),
  address_street: z.string().trim().max(200).optional(),
  address_zip: z.string().trim().max(20).optional(),
  address_city: z.string().trim().max(120).optional(),
  address_country: z.string().trim().min(1, "Land fehlt").max(80),
  tax_number: z.string().trim().max(60).optional(),
  vat_id: z.string().trim().max(60).optional(),
  bank_name: z.string().trim().max(120).optional(),
  iban: z.string().trim().max(60).optional(),
  bic: z.string().trim().max(20).optional(),
  payment_terms_days: z.coerce.number().int().min(0).max(365),
  // Kassenvorgaben: der Steuersatz und die Preislesart der Ladenkasse stehen
  // in der Datenbank, nicht im Code (siehe migrations/018_kasse_pos.sql).
  pos_vat_rate: z.coerce.number().refine((v) => [0, 7, 19].includes(v), {
    message: "Steuersatz muss 0, 7 oder 19 % sein",
  }),
  pos_prices_gross: z.boolean(),
  pos_receipt_footer: z.string().trim().max(300).optional(),
});

export async function updateCompanySettings(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    company_name: formData.get("company_name") || undefined,
    address_street: formData.get("address_street") || undefined,
    address_zip: formData.get("address_zip") || undefined,
    address_city: formData.get("address_city") || undefined,
    address_country: formData.get("address_country") || "Deutschland",
    tax_number: formData.get("tax_number") || undefined,
    vat_id: formData.get("vat_id") || undefined,
    bank_name: formData.get("bank_name") || undefined,
    iban: formData.get("iban") || undefined,
    bic: formData.get("bic") || undefined,
    payment_terms_days: formData.get("payment_terms_days") || 14,
    pos_vat_rate: formData.get("pos_vat_rate") || 19,
    pos_prices_gross: formData.get("pos_prices_gross") === "on",
    pos_receipt_footer: formData.get("pos_receipt_footer") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({
      company_name: data.company_name || null,
      address_street: data.address_street || null,
      address_zip: data.address_zip || null,
      address_city: data.address_city || null,
      address_country: data.address_country,
      tax_number: data.tax_number || null,
      vat_id: data.vat_id || null,
      bank_name: data.bank_name || null,
      iban: data.iban || null,
      bic: data.bic || null,
      payment_terms_days: data.payment_terms_days,
      pos_vat_rate: data.pos_vat_rate,
      pos_prices_gross: data.pos_prices_gross,
      pos_receipt_footer: data.pos_receipt_footer || null,
    })
    .eq("id", true);

  if (error) {
    console.error("[admin] Firmendaten speichern:", error.message);
    return { error: "Die Firmendaten konnten nicht gespeichert werden." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/pos");
  return { success: "Firmendaten gespeichert." };
}
