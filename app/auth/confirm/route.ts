import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Ziel des Links aus Supabase-Auth-Mails (Passwort-Reset, künftig ggf. auch
 * Einladungen). Erwartet token_hash + type nach dem von Supabase empfohlenen
 * "PKCE via token_hash"-Muster (siehe Supabase-Dashboard -> Authentication ->
 * Email Templates -> "Reset Password": Link muss auf
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery zeigen).
 * verifyOtp() setzt bei Erfolg die Session-Cookies für den Folge-Request.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      const next = type === "recovery" ? "/reset-password" : "/";
      redirect(`${origin}${next}`);
    }
  }

  redirect(`${origin}/forgot-password?error=ungueltig`);
}
