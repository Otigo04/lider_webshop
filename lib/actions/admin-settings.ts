"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

const settingsSchema = z.object({
  company_name: z.string().trim().max(160).optional(),
  owner_name: z.string().trim().max(160).optional(),
  address_street: z.string().trim().max(200).optional(),
  address_zip: z.string().trim().max(20).optional(),
  address_city: z.string().trim().max(120).optional(),
  address_country: z.string().trim().min(1, "Land fehlt").max(80),
  // Kontaktangaben der Rechnungsfußzeile. Die E-Mail wird als E-Mail geprüft,
  // damit keine unerreichbare Adresse auf jedem Beleg landet; Telefon und
  // Webseite bleiben frei, dafür gibt es keine sinnvolle Prüfung.
  phone: z.string().trim().max(60).optional(),
  email: z
    .string()
    .trim()
    .max(160)
    .email("Keine gültige E-Mail-Adresse")
    .optional(),
  website: z.string().trim().max(160).optional(),
  tax_number: z.string().trim().max(60).optional(),
  vat_id: z.string().trim().max(60).optional(),
  bank_name: z.string().trim().max(120).optional(),
  iban: z.string().trim().max(60).optional(),
  bic: z.string().trim().max(20).optional(),
  payment_terms_days: z.coerce.number().int().min(0).max(365),
  // Versandkostenfreigrenze (Migration 037). Betriebsentscheidung, deshalb
  // eine Eingabe und keine Konstante im Code. 0 heißt „immer kostenfrei".
  free_shipping_threshold: z.coerce.number().min(0).max(100_000),
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
    owner_name: formData.get("owner_name") || undefined,
    address_street: formData.get("address_street") || undefined,
    address_zip: formData.get("address_zip") || undefined,
    address_city: formData.get("address_city") || undefined,
    address_country: formData.get("address_country") || "Deutschland",
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    website: formData.get("website") || undefined,
    tax_number: formData.get("tax_number") || undefined,
    vat_id: formData.get("vat_id") || undefined,
    bank_name: formData.get("bank_name") || undefined,
    iban: formData.get("iban") || undefined,
    bic: formData.get("bic") || undefined,
    payment_terms_days: formData.get("payment_terms_days") || 14,
    free_shipping_threshold: formData.get("free_shipping_threshold") ?? 300,
    pos_vat_rate: formData.get("pos_vat_rate") || 19,
    pos_prices_gross: formData.get("pos_prices_gross") === "on",
    pos_receipt_footer: formData.get("pos_receipt_footer") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const felder = {
    company_name: data.company_name || null,
    owner_name: data.owner_name || null,
    address_street: data.address_street || null,
    address_zip: data.address_zip || null,
    address_city: data.address_city || null,
    address_country: data.address_country,
    phone: data.phone || null,
    email: data.email || null,
    website: data.website || null,
    tax_number: data.tax_number || null,
    vat_id: data.vat_id || null,
    bank_name: data.bank_name || null,
    iban: data.iban || null,
    bic: data.bic || null,
    payment_terms_days: data.payment_terms_days,
    free_shipping_threshold: data.free_shipping_threshold,
    pos_vat_rate: data.pos_vat_rate,
    pos_prices_gross: data.pos_prices_gross,
    pos_receipt_footer: data.pos_receipt_footer || null,
  };

  let { error } = await supabase
    .from("company_settings")
    .update(felder)
    .eq("id", true);

  /*
   * Spalte fehlt, weil Migration 037 noch nicht eingespielt ist. Zwei Codes,
   * weil zwei Schichten meckern können: PGRST204 kommt von PostgREST („nicht
   * im Schema-Cache"), 42703 von Postgres selbst. Beim Schreiben ist es in
   * aller Regel PGRST204 – die Anfrage scheitert schon an der Übersetzung.
   *
   * Ohne diesen Rückfall scheiterte das Speichern der gesamten Firmendaten an
   * einem einzigen neuen Feld – der Admin könnte dann weder Bankverbindung
   * noch Steuersatz ändern, bis jemand die Migration nachzieht.
   */
  if (error?.code === "PGRST204" || error?.code === "42703") {
    console.warn(
      "[admin] Spalte company_settings.free_shipping_threshold fehlt – " +
        "Migration 037 noch nicht eingespielt. Versandgrenze wird nicht gespeichert.",
    );
    const { free_shipping_threshold: _weg, ...ohneGrenze } = felder;
    void _weg;
    ({ error } = await supabase
      .from("company_settings")
      .update(ohneGrenze)
      .eq("id", true));
  }

  if (error) {
    console.error("[admin] Firmendaten speichern:", error.message);
    return { error: "Die Firmendaten konnten nicht gespeichert werden." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/kasse/terminal");
  // Die Versandgrenze steht auch im Schaufenster und im Bestellweg.
  revalidatePath("/");
  revalidatePath("/versand");
  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: "Firmendaten gespeichert." };
}

/**
 * Wartungsmodus an- oder ausschalten (Migration 041). Eigene Action statt
 * ein Feld in updateCompanySettings(): ein Checkbox-Klick am Tresen soll
 * nicht am Rest des – deutlich größeren – Firmendaten-Formulars hängen, und
 * ein Fehler dort soll den Schalter nicht mit ins Leere laufen lassen.
 */
export async function setMaintenanceMode(
  aktiv: boolean,
): Promise<AdminFormState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({ maintenance_mode: aktiv })
    .eq("id", true);

  // Migration 041 noch nicht eingespielt – siehe Kommentar bei
  // updateCompanySettings() zu PGRST204/42703.
  if (error?.code === "PGRST204" || error?.code === "42703") {
    return {
      error:
        "Die Tabelle kennt den Wartungsmodus noch nicht. Bitte supabase/migrations/041_wartungsmodus.sql im Supabase SQL-Editor ausführen.",
    };
  }

  if (error) {
    console.error("[admin] Wartungsmodus umschalten:", error.message);
    return { error: "Der Wartungsmodus konnte nicht geändert werden." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/wartung");
  return {
    success: aktiv
      ? "Wartungsmodus eingeschaltet – unregistrierte Besucher sehen jetzt den Wartungsscreen."
      : "Wartungsmodus ausgeschaltet – der Shop ist wieder für alle sichtbar.",
  };
}

const maintenanceContentSchema = z.object({
  // Leer heißt "kein eigener Titel/Text" – /wartung zeigt dann den Standard.
  maintenance_title: z.string().trim().max(80).optional(),
  maintenance_message: z.string().trim().max(400).optional(),
  // z.string().date() prüft das Format YYYY-MM-DD, wie es <input type="date">
  // liefert. Optional: das Datum ist eine Zusatzangabe, kein Pflichtfeld.
  maintenance_until: z.string().trim().date().optional(),
});

/**
 * Eigener Titel, Text und optionales Datum für /wartung (Migration 043,
 * 044). Eigene Action statt in updateCompanySettings(): ein Formular für
 * drei Felder soll nicht am Rest der – deutlich größeren – Firmendaten
 * hängen.
 */
export async function updateMaintenanceContent(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = maintenanceContentSchema.safeParse({
    maintenance_title: formData.get("maintenance_title") || undefined,
    maintenance_message: formData.get("maintenance_message") || undefined,
    maintenance_until: formData.get("maintenance_until") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({
      maintenance_title: data.maintenance_title || null,
      maintenance_message: data.maintenance_message || null,
      maintenance_until: data.maintenance_until || null,
    })
    .eq("id", true);

  if (error?.code === "PGRST204" || error?.code === "42703") {
    return {
      error:
        "Die Tabelle kennt Wartungstitel/-text/-datum noch nicht. Bitte supabase/migrations/043_wartungsmodus_nachricht.sql und 044_wartungsmodus_titel.sql im Supabase SQL-Editor ausführen.",
    };
  }

  if (error) {
    console.error("[admin] Wartungstext speichern:", error.message);
    return { error: "Text und Datum konnten nicht gespeichert werden." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/wartung");
  return { success: "Wartungstext gespeichert." };
}
