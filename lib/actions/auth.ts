"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

const loginSchema = z.object({
  email: z.string().trim().min(1, "E-Mail fehlt").email("Keine gültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort fehlt"),
  redirectTo: z.string().optional(),
});

/**
 * Nur interne Pfade zulassen. Ohne diese Prüfung könnte ein präparierter Link
 * wie /login?redirect=https://fremde-seite.de nach dem Login weiterleiten
 * (Open Redirect).
 */
function safeRedirect(target: string | undefined, fallback: string): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, redirectTo } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    // Bewusst unspezifisch: verrät nicht, ob die E-Mail existiert.
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return {
      error:
        "Zu diesem Konto gibt es kein Kundenprofil. Bitte wenden Sie sich an uns.",
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return {
      error: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an uns.",
    };
  }

  revalidatePath("/", "layout");

  const fallback = profile.role === "admin" ? "/admin" : "/shop";
  redirect(safeRedirect(redirectTo, fallback));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
