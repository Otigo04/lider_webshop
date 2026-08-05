import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-Client für Client Components.
 * Nutzt den öffentlichen Key – unterliegt vollständig den RLS-Policies.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
