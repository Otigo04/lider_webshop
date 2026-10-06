import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getImageUrls } from "@/lib/storage";
import type { HomeSlide } from "@/lib/types";

/** Werbebild mit signierten URLs – so geht es an den Slider. */
export interface SlideMitBild extends HomeSlide {
  imageUrl: string | null;
  mobileImageUrl: string | null;
}

const SPALTEN =
  "id, title, subtitle, cta_label, link_url, image_path, mobile_image_path, tone, is_active, valid_from, valid_until, order_index";

async function mitBildern(slides: HomeSlide[]): Promise<SlideMitBild[]> {
  const urls = await getImageUrls(
    slides.flatMap((s) => [s.image_path, s.mobile_image_path]),
  );
  return slides.map((s, i) => ({
    ...s,
    imageUrl: urls[i * 2],
    mobileImageUrl: urls[i * 2 + 1],
  }));
}

/**
 * Was gerade läuft – Laufzeit und Status filtert RLS (home_slides_read).
 * Fehlt die Tabelle (Migration 055 nicht eingespielt), bleibt der Slider weg.
 */
export async function getActiveSlides(): Promise<SlideMitBild[]> {
  const supabase = await createClient();
  const jetzt = new Date().toISOString();
  const { data, error } = await supabase
    .from("home_slides")
    .select(SPALTEN)
    .eq("is_active", true)
    // Der Admin sieht per RLS auch Geplantes – auf der Startseite nicht.
    .or(`valid_from.is.null,valid_from.lte.${jetzt}`)
    .or(`valid_until.is.null,valid_until.gt.${jetzt}`)
    .order("order_index")
    .order("created_at");

  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[slider] Laden:", error.message);
    }
    return [];
  }
  const mitBild = await mitBildern((data ?? []) as HomeSlide[]);
  return mitBild.filter((s) => s.imageUrl);
}

/** Alle Werbebilder für die Verwaltung, auch inaktive und geplante. */
export async function getAllSlides(): Promise<SlideMitBild[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_slides")
    .select(SPALTEN)
    .order("order_index")
    .order("created_at");

  if (error) {
    console.error("[slider] Verwaltung:", error.message);
    return [];
  }
  return mitBildern((data ?? []) as HomeSlide[]);
}
