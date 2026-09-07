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

export interface SignUpState {
  error?: string;
  success?: string;
}

const signUpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse"),
    password: z.string().min(10, "Das Passwort braucht mindestens 10 Zeichen").max(200),
    confirm: z.string(),
    full_name: z.string().trim().min(1, "Name fehlt").max(120),
    company_name: z.string().trim().min(1, "Firma fehlt").max(120),
    /*
     * Die Anschrift ist Pflicht, nicht Kür: sie steht später auf jeder
     * Rechnung. Sie erst im Konto nachpflegen zu lassen hieße, dass die erste
     * Bestellung eine Rechnung ohne Empfängeranschrift erzeugt.
     */
    billing_street: z.string().trim().min(1, "Straße und Hausnummer fehlen").max(200),
    billing_zip: z.string().trim().min(1, "PLZ fehlt").max(20),
    billing_city: z.string().trim().min(1, "Ort fehlt").max(120),
    billing_country: z.string().trim().min(1, "Land fehlt").max(80),
    different_shipping: z.boolean(),
    shipping_street: z.string().trim().max(200).optional(),
    shipping_zip: z.string().trim().max(20).optional(),
    shipping_city: z.string().trim().max(120).optional(),
    shipping_country: z.string().trim().max(80).optional(),
    /*
     * Bestätigung der Gewerbeeigenschaft. Der Shop zeigt Nettopreise; die
     * sind nur gegenüber Gewerbetreibenden zulässig. Die Erklärung steht
     * damit nicht nur als Satz auf der Seite, sondern wird abgefragt.
     */
    gewerbe: z.boolean(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["confirm"],
  })
  .refine((data) => data.gewerbe, {
    message: "Bitte bestätigen Sie, dass Sie als Gewerbetreibender bestellen",
    path: ["gewerbe"],
  })
  .refine(
    (data) =>
      !data.different_shipping ||
      Boolean(data.shipping_street && data.shipping_zip && data.shipping_city),
    {
      message: "Bitte die abweichende Lieferadresse vollständig angeben",
      path: ["shipping_street"],
    },
  );

/**
 * Self-Signup für B2B-Kunden: sofort aktiv (users.is_active ist DEFAULT true,
 * siehe supabase/schema.sql), keine Freischaltung durch den Admin nötig. Der
 * Trigger handle_new_user() legt das public.users-Profil automatisch an –
 * hier wird bewusst NIE eine "role" mitgegeben, damit niemand sich selbst zum
 * Admin macht.
 */
export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  // Lockvogelfeld gegen Formularroboter, gleiches Muster wie bei der
  // Zugangsanfrage (components/forms/access-request-form.tsx).
  if (formData.get("website")) {
    return { success: "Konto angelegt." };
  }

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    full_name: formData.get("full_name"),
    company_name: formData.get("company_name"),
    billing_street: formData.get("billing_street"),
    billing_zip: formData.get("billing_zip"),
    billing_city: formData.get("billing_city"),
    billing_country: formData.get("billing_country") || "Deutschland",
    different_shipping: formData.get("different_shipping") === "on",
    shipping_street: formData.get("shipping_street") ?? undefined,
    shipping_zip: formData.get("shipping_zip") ?? undefined,
    shipping_city: formData.get("shipping_city") ?? undefined,
    shipping_country: formData.get("shipping_country") ?? undefined,
    gewerbe: formData.get("gewerbe") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, full_name, company_name } = parsed.data;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  /*
   * Die Adresse reist als Metadatum mit und wird vom Trigger handle_new_user()
   * ins Profil geschrieben (Migration 029). Sie hier nach dem signUp per
   * UPDATE nachzutragen ginge nicht: bei aktivierter E-Mail-Bestätigung gibt
   * es an dieser Stelle noch keine Session, mit der man schreiben dürfte.
   */
  const abweichend = parsed.data.different_shipping;
  const adresse = {
    billing_street: parsed.data.billing_street,
    billing_zip: parsed.data.billing_zip,
    billing_city: parsed.data.billing_city,
    billing_country: parsed.data.billing_country,
    shipping_street: abweichend
      ? parsed.data.shipping_street
      : parsed.data.billing_street,
    shipping_zip: abweichend ? parsed.data.shipping_zip : parsed.data.billing_zip,
    shipping_city: abweichend ? parsed.data.shipping_city : parsed.data.billing_city,
    shipping_country:
      (abweichend ? parsed.data.shipping_country : parsed.data.billing_country) ||
      parsed.data.billing_country,
  };
  const supabase = await createClient();

  /*
   * Bremse gegen massenhaft angelegte Konten (Migration 027). Jedes Konto ist
   * sofort aktiv und sieht damit Staffelpreise und Bestände – ohne Grenze
   * könnte ein Skript sich beliebig viele davon holen.
   *
   * Ein Fehler beim Aufruf blockiert die Registrierung nicht: eine Bremse, die
   * bei einer Störung den ganzen Zugang zusperrt, richtet mehr Schaden an als
   * sie verhindert.
   */
  const { data: erlaubt, error: bremseFehler } = await supabase.rpc("signup_zulaessig");
  if (bremseFehler) {
    console.error("[auth] Registrierungsbremse:", bremseFehler.message);
  } else if (erlaubt === false) {
    return {
      error:
        "Derzeit gehen sehr viele Registrierungen ein. Bitte versuchen Sie es später erneut.",
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, company_name, ...adresse },
      emailRedirectTo: `${siteUrl}/auth/confirm?type=signup`,
    },
  });

  if (error || !data.user) {
    return {
      error: error?.message.includes("already")
        ? "Zu dieser E-Mail-Adresse gibt es bereits ein Konto."
        : "Die Registrierung ist fehlgeschlagen.",
    };
  }

  if (data.session) {
    // "Confirm email" ist im Supabase-Dashboard deaktiviert – die Session
    // steht sofort, direkt weiter auf die Begrüßungsseite.
    revalidatePath("/", "layout");
    redirect("/willkommen");
  }

  return {
    success:
      "Konto angelegt. Bitte bestätigen Sie Ihre E-Mail-Adresse über den Link, den wir Ihnen geschickt haben.",
  };
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
