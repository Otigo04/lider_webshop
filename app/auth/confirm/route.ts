import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Ziel aller Links aus Supabase-Auth-Mails: Registrierungsbestätigung,
 * Passwort-Reset, E-Mail-Wechsel, Einladung.
 *
 * Supabase schickt je nach Mail-Vorlage eine von drei Formen hierher:
 *
 *  1. `?token_hash=...&type=...` – die empfohlene Vorlage
 *     ({{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup).
 *     Wir lösen das Token selbst per verifyOtp() ein.
 *  2. `?code=...` – die Standardvorlage mit {{ .ConfirmationURL }} unter PKCE.
 *     Supabase hat das Token bereits geprüft und reicht nur noch den Code
 *     zum Eintauschen durch.
 *  3. gar nichts außer dem `type` aus emailRedirectTo – Supabase hat
 *     verifiziert und die Session anderweitig gesetzt. Ein Fehler käme in
 *     diesem Fall als `?error=` zurück.
 *
 * Fall 2 und 3 fehlten früher; beides fiel deshalb auf das Fehlerziel des
 * Passwort-Ablaufs durch – ein frisch bestätigtes Konto landete auf
 * "Passwort vergessen".
 */

/** Wohin nach erfolgreicher Bestätigung – abhängig davon, was bestätigt wurde. */
function zielNachErfolg(type: EmailOtpType | null): string {
  switch (type) {
    case "recovery":
      return "/reset-password";
    case "email_change":
      return "/account";
    default:
      // signup, invite, magiclink, email
      return "/willkommen";
  }
}

/** Wohin, wenn der Link abgelaufen oder schon benutzt ist. */
function zielNachFehler(type: EmailOtpType | null): string {
  return type === "recovery"
    ? "/forgot-password?error=ungueltig"
    : "/login?error=bestaetigung";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const type = searchParams.get("type") as EmailOtpType | null;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");

  // Supabase meldet abgelaufene oder verbrauchte Links über diese Parameter.
  if (searchParams.get("error") || searchParams.get("error_code")) {
    console.error(
      "[auth] Bestätigungslink abgelehnt:",
      searchParams.get("error_description") ?? searchParams.get("error"),
    );
    redirect(`${origin}${zielNachFehler(type)}`);
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (error) {
      console.error("[auth] verifyOtp:", error.message);
      redirect(`${origin}${zielNachFehler(type)}`);
    }

    redirect(`${origin}${zielNachErfolg(type)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth] exchangeCodeForSession:", error.message);
      redirect(`${origin}${zielNachFehler(type)}`);
    }

    redirect(`${origin}${zielNachErfolg(type)}`);
  }

  /*
   * Weder Token noch Code, aber auch kein Fehler: Supabase hat die Adresse
   * bereits bestätigt und leitet nur noch weiter. Für den Passwort-Ablauf
   * wäre das zu wenig – ohne Recovery-Session kann /reset-password nichts
   * setzen –, deshalb dort zurück zum Anfordern.
   */
  if (type === "recovery" || !type) {
    redirect(`${origin}${zielNachFehler(type)}`);
  }

  redirect(`${origin}${zielNachErfolg(type)}`);
}
