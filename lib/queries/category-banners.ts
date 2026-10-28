import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getImageUrls } from "@/lib/storage";
import type { CategoryBanner } from "@/lib/types";

/** Banner mit signierten URLs – so geht es an den Slider. */
export interface BannerMitBild extends CategoryBanner {
  imageUrl: string | null;
  mobileImageUrl: string | null;
}

const SPALTEN =
  "id, category_id, title, subtitle, cta_label, link_url, image_path, mobile_image_path, tone, is_active, valid_from, valid_until, order_index";

async function mitBildern(banner: CategoryBanner[]): Promise<BannerMitBild[]> {
  const urls = await getImageUrls(
    banner.flatMap((b) => [b.image_path, b.mobile_image_path]),
  );
  return banner.map((b, i) => ({
    ...b,
    imageUrl: urls[i * 2],
    mobileImageUrl: urls[i * 2 + 1],
  }));
}

/**
 * Was in der Warengruppe gerade läuft – Laufzeit und Status filtert RLS
 * (category_banners_read). Fehlt die Tabelle (Migration 075 nicht
 * eingespielt), bleibt die Seite ohne Banner.
 */
export async function getActiveCategoryBanners(categoryId: string): Promise<BannerMitBild[]> {
  const supabase = await createClient();
  const jetzt = new Date().toISOString();
  const { data, error } = await supabase
    .from("category_banners")
    .select(SPALTEN)
    .eq("category_id", categoryId)
    .eq("is_active", true)
    // Der Admin sieht per RLS auch Geplantes – im Shop nicht.
    .or(`valid_from.is.null,valid_from.lte.${jetzt}`)
    .or(`valid_until.is.null,valid_until.gt.${jetzt}`)
    .order("order_index")
    .order("created_at");

  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[gruppen-banner] Laden:", error.message);
    }
    return [];
  }
  const mitBild = await mitBildern((data ?? []) as CategoryBanner[]);
  return mitBild.filter((b) => b.imageUrl);
}

/** Alle Banner für die Verwaltung (alle Warengruppen), auch inaktive und geplante. */
export async function getAllCategoryBanners(): Promise<BannerMitBild[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("category_banners")
    .select(SPALTEN)
    .order("order_index")
    .order("created_at");

  if (error) {
    console.error("[gruppen-banner] Verwaltung:", error.message);
    return [];
  }
  return mitBildern((data ?? []) as CategoryBanner[]);
}
