"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

export interface CustomerFormState extends AdminFormState {
  /** Nur direkt nach dem Anlegen gesetzt – wird genau einmal angezeigt. */
  temporaryPassword?: string;
}

/**
 * Startpasswort. Ohne mehrdeutige Zeichen (0/O, 1/l/I), weil es meist
 * telefonisch oder auf Papier weitergegeben wird.
 */
function generatePassword(length = 14): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

/*
 * Anschrift eines vom Admin angelegten Kunden. Optional, anders als bei der
 * Selbstregistrierung: eine Telefonbestellung wird aufgenommen, während der
 * Kunde am Apparat ist, und da fehlt schon mal die Hausnummer. Sie steht
 * später auf der Rechnung, also gehört sie hierher und nicht nur ins
 * Kundenkonto – der Kunde selbst kommt an diese Felder nur, wenn er sich
 * anmeldet, und genau das tut ein Telefonbesteller nicht.
 */
const adressFelder = {
  billing_street: z.string().trim().max(200).optional(),
  billing_zip: z.string().trim().max(20).optional(),
  billing_city: z.string().trim().max(120).optional(),
  billing_country: z.string().trim().max(80).optional(),
} as const;

/** Adressfelder aus dem Formular lesen. */
function leseAdresse(formData: FormData) {
  return {
    billing_street: formData.get("billing_street") || undefined,
    billing_zip: formData.get("billing_zip") || undefined,
    billing_city: formData.get("billing_city") || undefined,
    billing_country: formData.get("billing_country") || undefined,
  };
}

/**
 * Adresse für das UPDATE aufbereiten. Die Versandadresse wird gespiegelt,
 * solange keine eigene gepflegt ist – der Checkout schlägt sonst nichts vor.
 */
function adresseSchreiben(data: {
  billing_street?: string;
  billing_zip?: string;
  billing_city?: string;
  billing_country?: string;
}) {
  return {
    billing_street: data.billing_street || null,
    billing_zip: data.billing_zip || null,
    billing_city: data.billing_city || null,
    billing_country: data.billing_country || null,
    shipping_street: data.billing_street || null,
    shipping_zip: data.billing_zip || null,
    shipping_city: data.billing_city || null,
    shipping_country: data.billing_country || null,
  };
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse"),
  full_name: z.string().trim().min(1, "Name fehlt").max(120),
  company_name: z.string().trim().max(120).optional(),
  // Ohne Formatprüfung, siehe Migration 028.
  vat_id: z.string().trim().max(40).optional(),
  ...adressFelder,
});

/**
 * Legt Konto und Profil an. Braucht den Service-Key, weil auth.admin nur damit
 * erreichbar ist – deshalb steht requireAdmin() zwingend davor.
 *
 * Es wird bewusst keine E-Mail verschickt: der Standard-SMTP von Supabase ist
 * stark limitiert und nur für Teammitglieder gedacht. Das Startpasswort wird
 * einmal angezeigt und vom Admin weitergegeben. Sobald ein eigener
 * SMTP-Anbieter hinterlegt ist, lässt sich das auf inviteUserByEmail umstellen.
 */
export async function createCustomer(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireAdmin();

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    company_name: formData.get("company_name") || undefined,
    vat_id: formData.get("vat_id") || undefined,
    ...leseAdresse(formData),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, full_name, company_name, vat_id } = parsed.data;
  const password = generatePassword();
  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, company_name: company_name ?? null },
  });

  if (error || !data.user) {
    console.error("[admin] Kunde anlegen:", error?.message);
    return {
      error: error?.message.includes("already")
        ? "Zu dieser E-Mail-Adresse gibt es bereits ein Konto."
        : "Das Konto konnte nicht angelegt werden.",
    };
  }

  // Der Trigger handle_new_user hat das Profil bereits erzeugt. Hier werden
  // nur noch die Felder nachgezogen, falls die Metadaten nicht durchkamen.
  const { error: profileError } = await supabaseAdmin
    .from("users")
    .update({
      full_name,
      company_name: company_name || null,
      vat_id: vat_id || null,
      ...adresseSchreiben(parsed.data),
    })
    .eq("id", data.user.id);

  if (profileError) {
    console.error("[admin] Kundenprofil:", profileError.message);
  }

  revalidatePath("/admin/customers");
  return {
    success: `Konto für ${email} angelegt.`,
    temporaryPassword: password,
  };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(1, "Name fehlt").max(120),
  company_name: z.string().trim().max(120).optional(),
  vat_id: z.string().trim().max(40).optional(),
  ...adressFelder,
});

export async function updateCustomer(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireAdmin();

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    full_name: formData.get("full_name"),
    company_name: formData.get("company_name") || undefined,
    vat_id: formData.get("vat_id") || undefined,
    ...leseAdresse(formData),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({
      full_name: parsed.data.full_name,
      company_name: parsed.data.company_name || null,
      vat_id: parsed.data.vat_id || null,
      ...adresseSchreiben(parsed.data),
    })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] Kunde aktualisieren:", error.message);
    return { error: "Die Änderungen konnten nicht gespeichert werden." };
  }

  revalidatePath("/admin/customers");
  return { success: "Kundendaten gespeichert." };
}

/**
 * Aktiv/inaktiv umschalten. Deaktivierte Kunden kommen weder in den Shop noch
 * an ihre Daten – die Bestellhistorie bleibt aber erhalten.
 */
export async function toggleCustomerActive(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("is_active") === "true";
  if (!id) return { error: "Kein Kunde ausgewählt." };

  if (id === admin.id) {
    return { error: "Das eigene Konto lässt sich nicht deaktivieren." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ is_active: active })
    .eq("id", id);

  if (error) {
    console.error("[admin] Kunde umschalten:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }

  revalidatePath("/admin/customers");
  return { success: active ? "Kunde aktiviert." : "Kunde deaktiviert." };
}

/** Neues Startpasswort setzen, wenn ein Kunde sich ausgesperrt hat. */
export async function resetCustomerPassword(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Kunde ausgewählt." };

  const password = generatePassword();
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password,
  });

  if (error) {
    console.error("[admin] Passwort zurücksetzen:", error.message);
    return { error: "Das Passwort konnte nicht zurückgesetzt werden." };
  }

  return { success: "Neues Startpasswort gesetzt.", temporaryPassword: password };
}
