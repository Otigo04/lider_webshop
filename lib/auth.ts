import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

/**
 * Auth-Helfer für Server Components, Server Actions und Route Handler.
 * Der Proxy (proxy.ts) hält die Session frisch – hier wird nur ausgelesen.
 */

/** Eingeloggter auth.users-Datensatz oder null. Validiert gegen den Auth-Server. */
export async function getCurrentAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Profil aus public.users inkl. Rolle und Aktiv-Status.
 * null, wenn nicht eingeloggt oder kein Profil existiert.
 */
const PROFIL_SPALTEN = `id, email, full_name, company_name, role, is_active, created_at,
   billing_street, billing_zip, billing_city, billing_country,
   shipping_street, shipping_zip, shipping_city, shipping_country`;

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select(`${PROFIL_SPALTEN}, vat_id`)
    .eq("id", user.id)
    .single();

  if (!error) return data as AppUser;

  /*
   * 42703 = "column does not exist". Tritt genau dann auf, wenn
   * supabase/migrations/028_kunden_ust_id.sql noch nicht eingespielt ist.
   *
   * Ohne diesen Rückfall bräche an dieser Stelle nicht ein Feld, sondern die
   * gesamte Anmeldung: ein Profil, das nicht lädt, gilt überall als "nicht
   * eingeloggt". Ein Nachrüsten der Spalte ist Betriebssache und darf keinen
   * Kunden aussperren. Der Zweig kann weg, sobald die Migration überall läuft.
   */
  if (error.code === "42703") {
    console.warn(
      "[auth] Spalte users.vat_id fehlt – Migration 028 noch nicht eingespielt. " +
        "Profil wird ohne USt-IdNr. geladen.",
    );
    const { data: ohneUstId, error: zweiterFehler } = await supabase
      .from("users")
      .select(PROFIL_SPALTEN)
      .eq("id", user.id)
      .single();

    if (!zweiterFehler) {
      return { ...(ohneUstId as Omit<AppUser, "vat_id">), vat_id: null };
    }
    console.error(
      "[auth] Profil konnte nicht geladen werden:",
      zweiterFehler.message,
    );
    return null;
  }

  console.error("[auth] Profil konnte nicht geladen werden:", error.message);
  return null;
}

/**
 * Erzwingt eine aktive Anmeldung. Leitet sonst auf /login um.
 * Deaktivierte Konten (is_active = false) werden ebenfalls abgewiesen.
 */
export async function requireUser(redirectTo?: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = redirectTo
      ? `/login?redirect=${encodeURIComponent(redirectTo)}`
      : "/login";
    redirect(target);
  }
  if (!user.is_active) {
    redirect("/login?error=deaktiviert");
  }
  return user;
}

/** Erzwingt Admin-Rechte. Kunden landen im Shop, Gäste auf /login. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") {
    redirect("/shop");
  }
  return user;
}

/** Ohne Redirect – für bedingtes Rendern, z. B. Admin-Link im Header. */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin" && user.is_active;
}
