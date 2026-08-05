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

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse"),
  full_name: z.string().trim().min(1, "Name fehlt").max(120),
  company_name: z.string().trim().max(120).optional(),
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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, full_name, company_name } = parsed.data;
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
    .update({ full_name, company_name: company_name || null })
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
