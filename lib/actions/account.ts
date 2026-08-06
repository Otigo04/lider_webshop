"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name fehlt").max(120),
  company_name: z.string().trim().max(120).optional(),
});

/**
 * Rolle und Aktiv-Status stehen bewusst nicht im Formular. Selbst wenn sie
 * mitgeschickt würden, blockt der Trigger protect_user_privileges in der DB.
 */
export async function updateProfile(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/account");

  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    company_name: formData.get("company_name") ?? undefined,
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
    .eq("id", user.id);

  if (error) {
    console.error("[konto] Profil:", error.message);
    return { error: "Die Änderungen konnten nicht gespeichert werden." };
  }

  revalidatePath("/", "layout");
  return { success: "Stammdaten gespeichert." };
}

const addressSchema = z.object({
  billing_street: z.string().trim().max(200).optional(),
  billing_zip: z.string().trim().max(20).optional(),
  billing_city: z.string().trim().max(120).optional(),
  billing_country: z.string().trim().max(80).optional(),
  different_shipping: z.boolean(),
  shipping_street: z.string().trim().max(200).optional(),
  shipping_zip: z.string().trim().max(20).optional(),
  shipping_city: z.string().trim().max(120).optional(),
  shipping_country: z.string().trim().max(80).optional(),
});

/**
 * Ohne Häkchen bei "Abweichende Lieferadresse" wird die Versandadresse
 * beim Speichern auf die Rechnungsadresse gespiegelt – so bleibt der
 * Checkout-Vorschlag (lib/queries/products.ts nutzt ihn nicht, aber
 * app/checkout/page.tsx) auch ohne separate Eingabe korrekt befüllt.
 */
export async function updateAddresses(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/account");

  const parsed = addressSchema.safeParse({
    billing_street: formData.get("billing_street") ?? undefined,
    billing_zip: formData.get("billing_zip") ?? undefined,
    billing_city: formData.get("billing_city") ?? undefined,
    billing_country: formData.get("billing_country") ?? undefined,
    different_shipping: formData.get("different_shipping") === "on",
    shipping_street: formData.get("shipping_street") ?? undefined,
    shipping_zip: formData.get("shipping_zip") ?? undefined,
    shipping_city: formData.get("shipping_city") ?? undefined,
    shipping_country: formData.get("shipping_country") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const useShipping = data.different_shipping;

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({
      billing_street: data.billing_street || null,
      billing_zip: data.billing_zip || null,
      billing_city: data.billing_city || null,
      billing_country: data.billing_country || null,
      shipping_street: (useShipping ? data.shipping_street : data.billing_street) || null,
      shipping_zip: (useShipping ? data.shipping_zip : data.billing_zip) || null,
      shipping_city: (useShipping ? data.shipping_city : data.billing_city) || null,
      shipping_country: (useShipping ? data.shipping_country : data.billing_country) || null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[konto] Adressen:", error.message);
    return { error: "Die Adressen konnten nicht gespeichert werden." };
  }

  revalidatePath("/account");
  return { success: "Adressen gespeichert." };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Das Passwort braucht mindestens 10 Zeichen")
      .max(200),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["confirm"],
  });

export async function changePassword(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser("/account");

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[konto] Passwort:", error.message);
    return { error: "Das Passwort konnte nicht geändert werden." };
  }

  return { success: "Passwort geändert." };
}
