import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase-Client mit Service-Key. UMGEHT SÄMTLICHE RLS-POLICIES.
 *
 * Nur in Route Handlern / Server Actions verwenden und ausschließlich, nachdem
 * requireAdmin() aus lib/auth.ts die Berechtigung geprüft hat. Niemals in eine
 * Client Component importieren – `server-only` bricht den Build, falls doch.
 *
 * Gebraucht wird er für: Kunden anlegen (auth.admin), Kunden deaktivieren,
 * Admin-Übersichten über alle Kunden/Bestellungen.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
