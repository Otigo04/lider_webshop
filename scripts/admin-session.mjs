/**
 * Hilfsmittel für einmalige Pflegeskripte: eine echte Admin-Sitzung herstellen.
 *
 * Der Service-Key umgeht RLS, aber er ist kein angemeldeter Benutzer –
 * auth.uid() ist dabei NULL, und is_admin() ist damit false. Funktionen wie
 * record_stock_entries() lehnen ihn deshalb ab, und das zu Recht: sie
 * schreiben created_by und entscheiden über Berechtigungen.
 *
 * Statt die Prüfung zu umgehen, wird über die Admin-API ein Einmal-Token für
 * das Admin-Konto erzeugt und damit eine ganz normale Sitzung eröffnet. Es
 * läuft also genau das, was auch beim Klick in der Oberfläche liefe.
 */
import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } },
  );
}

/** Angemeldeter Client für das erste aktive Admin-Konto. */
export async function adminClient() {
  const dienst = serviceClient();

  const { data: admins, error } = await dienst
    .from("users")
    .select("id, email, full_name")
    .eq("role", "admin")
    .eq("is_active", true)
    .order("created_at")
    .limit(1);

  if (error) throw new Error(`Admin suchen: ${error.message}`);
  const admin = admins?.[0];
  if (!admin) throw new Error("Kein aktives Admin-Konto gefunden.");

  const { data: link, error: linkFehler } = await dienst.auth.admin.generateLink({
    type: "magiclink",
    email: admin.email,
  });
  if (linkFehler) throw new Error(`Einmal-Token: ${linkFehler.message}`);

  const sitzung = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error: otpFehler } = await sitzung.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (otpFehler) throw new Error(`Anmelden: ${otpFehler.message}`);

  return { db: sitzung, admin };
}
