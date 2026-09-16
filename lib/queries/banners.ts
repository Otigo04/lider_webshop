import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import type { SiteBanner } from "@/lib/types";

const SPALTEN = "id, message, link_url, link_label, tone, is_active, order_index";

/**
 * Solange Migration 035 nicht eingespielt ist, fehlt die Tabelle. Die Leiste
 * zeigt dann den Hinweis, mit dem die Migration sie ohnehin befüllt – sonst
 * bliebe sie bis zum Einspielen einfach leer, und niemand merkte, warum.
 */
const VORGABE: SiteBanner = {
  id: "vorgabe",
  message: `Ab ${FREE_SHIPPING_THRESHOLD} € Nettowarenwert versandkostenfrei`,
  link_url: "/versand",
  link_label: "Details",
  tone: "gold",
  is_active: true,
  order_index: 0,
};

function tabelleFehlt(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

/**
 * Aktive Hinweise für die Leiste. Über den öffentlichen Client: die Leiste
 * steht vor jedem Besucher und darf nicht am Sitzungstoken hängen (siehe
 * lib/supabase/public.ts).
 */
export async function getActiveBanners(): Promise<SiteBanner[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("site_banners")
    .select(SPALTEN)
    .eq("is_active", true)
    .order("order_index")
    .order("created_at");

  if (error) {
    if (tabelleFehlt(error.code)) return [VORGABE];
    console.error("[hinweisleiste] Laden:", error.message);
    return [];
  }
  return (data ?? []) as SiteBanner[];
}

/** Alle Hinweise, auch abgeschaltete – für /admin/settings. */
export async function getAllBanners(): Promise<{
  banners: SiteBanner[];
  /** false, solange Migration 035 fehlt */
  verfuegbar: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_banners")
    .select(SPALTEN)
    .order("order_index")
    .order("created_at");

  if (error) {
    if (!tabelleFehlt(error.code)) {
      console.error("[hinweisleiste] Verwaltung:", error.message);
    }
    return { banners: [], verfuegbar: !tabelleFehlt(error.code) };
  }
  return { banners: (data ?? []) as SiteBanner[], verfuegbar: true };
}
