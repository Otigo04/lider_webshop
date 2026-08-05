import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase-Client für Server Components, Server Actions und Route Handler.
 * Liest/schreibt die Session aus den Request-Cookies und respektiert RLS.
 *
 * In Next 16 ist `cookies()` async – der Client muss deshalb awaited werden:
 *   const supabase = await createClient();
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components dürfen keine Cookies schreiben.
            // Der Refresh passiert stattdessen in proxy.ts – hier bewusst ignoriert.
          }
        },
      },
    },
  );
}
