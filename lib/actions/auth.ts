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

export interface PasswordResetRequestState {
  success?: string;
  error?: string;
}

const resetRequestSchema = z.object({
  email: z.string().trim().min(1, "E-Mail fehlt").email("Keine gültige E-Mail-Adresse"),
});

/**
 * Meldet immer denselben Erfolg zurück, unabhängig davon, ob die E-Mail zu
 * einem Konto gehört – dasselbe "unspezifisch bei Fehlern"-Prinzip wie bei
 * signIn(). Sonst ließe sich über diesen Endpunkt erraten, welche
 * Kunden-Mails im System existieren.
 */
export async function requestPasswordReset(
  _prevState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  const success =
    "Falls zu dieser E-Mail-Adresse ein Konto existiert, wurde ein Link zum Zurücksetzen des Passworts verschickt.";

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?type=recovery`,
  });

  if (error) {
    console.error("[auth] Passwort-Reset-Anfrage:", error.message);
  }

  return { success };
}

export interface PasswordResetConfirmState {
  error?: string;
}

const resetConfirmSchema = z
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

/**
 * Setzt das neue Passwort über die Recovery-Session, die
 * app/auth/confirm/route.ts per verifyOtp() etabliert hat – kein
 * requireUser(), da der Nutzer hier nicht über den normalen Login kommt.
 */
export async function confirmPasswordReset(
  _prevState: PasswordResetConfirmState,
  formData: FormData,
): Promise<PasswordResetConfirmState> {
  const parsed = resetConfirmSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/forgot-password?error=ungueltig");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[auth] Passwort-Reset-Bestätigung:", error.message);
    return { error: "Das Passwort konnte nicht gesetzt werden." };
  }

  redirect("/login?notice=passwort_gesetzt");
}
