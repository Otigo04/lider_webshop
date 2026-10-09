"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { clearMustChangePassword } from "@/lib/password-flag";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  success?: string;
}

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name fehlt").max(120),
  company_name: z.string().trim().max(120).optional(),
  // Ohne Formatprüfung, siehe Migration 028: die Formate der Mitgliedstaaten
  // gehen zu weit auseinander, als dass eine Regex mehr nützte als schadete.
  vat_id: z.string().trim().max(40).optional(),
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
    vat_id: formData.get("vat_id") ?? undefined,
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
  const user = await requireUser("/account");

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

  await clearMustChangePassword(user.id);

  return { success: "Passwort geändert." };
}


/** Nur interne Pfade – ein präparierter Link darf nicht nach außen weiterleiten. */
function innererPfad(ziel: FormDataEntryValue | null, fallback: string): string {
  const pfad = typeof ziel === "string" ? ziel : "";
  return pfad.startsWith("/") && !pfad.startsWith("//") ? pfad : fallback;
}

const vervollstaendigenSchema = z.object({
  full_name: z.string().trim().min(1, "Der Ansprechpartner fehlt").max(120),
  company_name: z.string().trim().min(1, "Die Firma fehlt").max(120),
  vat_id: z.string().trim().max(40).optional(),
  billing_street: z.string().trim().min(1, "Straße und Hausnummer fehlen").max(200),
  billing_zip: z.string().trim().min(1, "Die PLZ fehlt").max(20),
  billing_city: z.string().trim().min(1, "Der Ort fehlt").max(120),
  billing_country: z.string().trim().min(1).max(80),
  // Netto-Preise gelten nur gegenüber Gewerbetreibenden – wie bei der
  // Registrierung wird das ausdrücklich bestätigt.
  gewerbe: z.literal(true, {
    message: "Bitte bestätigen Sie, dass Sie als Gewerbetreibender bestellen",
  }),
});

/**
 * Fehlende Profilangaben nachtragen (von der Kundenakte des Admins angelegte
 * Konten). Dieselben Pflichtfelder wie die Registrierung (lib/profil.ts). Die
 * Lieferadresse wird mit der Rechnungsadresse gefüllt, wenn noch keine
 * gepflegt ist – eine abweichende ändert der Kunde im Konto.
 */
export async function vervollstaendigeProfil(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/account/vervollstaendigen");

  const parsed = vervollstaendigenSchema.safeParse({
    full_name: formData.get("full_name"),
    company_name: formData.get("company_name"),
    vat_id: formData.get("vat_id") || undefined,
    billing_street: formData.get("billing_street"),
    billing_zip: formData.get("billing_zip"),
    billing_city: formData.get("billing_city"),
    billing_country: formData.get("billing_country") || "Deutschland",
    gewerbe: formData.get("gewerbe") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const hatVersand = Boolean(user.shipping_street && user.shipping_zip && user.shipping_city);
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({
      full_name: d.full_name,
      company_name: d.company_name,
      vat_id: d.vat_id || null,
      billing_street: d.billing_street,
      billing_zip: d.billing_zip,
      billing_city: d.billing_city,
      billing_country: d.billing_country,
      ...(hatVersand
        ? {}
        : {
            shipping_street: d.billing_street,
            shipping_zip: d.billing_zip,
            shipping_city: d.billing_city,
            shipping_country: d.billing_country,
          }),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[konto] Vervollständigen:", error.message);
    return { error: "Die Angaben konnten nicht gespeichert werden." };
  }

  revalidatePath("/", "layout");
  redirect(innererPfad(formData.get("weiter"), "/shop"));
}

/**
 * „Später ausfüllen“: die Erinnerung nach dem ersten Login entfällt. Vor der
 * ersten Bestellung kommt sie trotzdem (Checkout und createOrder).
 */
export async function profilSpaeter(formData: FormData): Promise<void> {
  const user = await requireUser("/shop");
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ profil_erinnert_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) console.error("[konto] Erinnerung merken:", error.message);

  redirect(innererPfad(formData.get("weiter"), "/shop"));
}


export interface NewsletterState {
  error?: string;
  success?: string;
}

/**
 * Newsletter an- oder abbestellen. Die Einwilligung kommt nur vom Kunden
 * selbst und wird mit Zeitpunkt festgehalten (Migration 065).
 */
export async function setNewsletter(
  _prevState: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const user = await requireUser("/account");
  const an = formData.get("newsletter") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update(
      an
        ? { newsletter_abo: true, newsletter_abo_at: new Date().toISOString() }
        : { newsletter_abo: false, newsletter_abgemeldet_at: new Date().toISOString() },
    )
    .eq("id", user.id);
  if (error) {
    console.error("[konto] Newsletter:", error.message);
    return { error: "Die Einstellung konnte nicht gespeichert werden." };
  }

  revalidatePath("/account");
  return { success: an ? "Sie erhalten jetzt unseren Newsletter." : "Newsletter abbestellt." };
}
