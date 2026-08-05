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
