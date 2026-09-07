import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Daten für app/sitemap.ts.
 *
 * Eigener Client ohne Cookies statt lib/supabase/server.ts: die Sitemap ist
 * für alle dieselbe und hat keinen Nutzer. Ein Client, der cookies() liest,
 * würde die Datei an die Sitzung binden und ließe sich nicht cachen.
 *
 * Gelesen wird ausschließlich, was auch ein anonymer Besucher sieht –
 * products_public (aktiv, mit Foto) und die Warengruppen.
 */

export interface SitemapEintrag {
  pfad: string;
  geaendert: Date;
}

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Alle öffentlich sichtbaren Artikel- und Warengruppenseiten. */
export async function getSitemapEntries(): Promise<SitemapEintrag[]> {
  const supabase = anonClient();

  const [artikel, gruppen] = await Promise.all([
    supabase
      .from("products_public")
      .select("id, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase.from("categories").select("slug, created_at"),
  ]);

  if (artikel.error) {
    console.error("[sitemap] Artikel:", artikel.error.message);
  }
  if (gruppen.error) {
    console.error("[sitemap] Warengruppen:", gruppen.error.message);
  }

  const eintraege: SitemapEintrag[] = [];

  for (const row of gruppen.data ?? []) {
    eintraege.push({
      pfad: `/shop/${row.slug as string}`,
      geaendert: new Date((row.created_at as string) ?? Date.now()),
    });
  }

  for (const row of artikel.data ?? []) {
    const stand = (row.updated_at as string | null) ?? (row.created_at as string);
    eintraege.push({
      pfad: `/shop/product/${row.id as string}`,
      geaendert: new Date(stand),
    });
  }

  return eintraege;
}
