import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase-Client ohne Session – für den öffentlichen Katalog.
 *
 * Landingpage und Schaufenster lesen nur, was ohnehin jeder sehen darf
 * (`products_public`, `categories`, `product_images`, `product_price_range`).
 * Trotzdem lief das bisher über den Cookie-Client: damit entschied das
 * Sitzungstoken des Besuchers darüber, ob die *öffentliche* Startseite
 * Warengruppen anzeigt. Ein Token, das die Datenbank gerade nicht annimmt
 * ("JWT issued at future" bei Uhrenversatz zwischen Auth und REST), machte aus
 * einem Anmeldeproblem eine leere Startseite.
 *
 * Ohne Token gibt es diese Kopplung nicht mehr. RLS greift unverändert – der
 * öffentliche Schlüssel kann nichts, was ein anonymer Besucher nicht auch
 * könnte.
 *
 * Für alles, was von der Anmeldung abhängt (Shop, Konto, Verwaltung), bleibt
 * `lib/supabase/server.ts` zuständig.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
