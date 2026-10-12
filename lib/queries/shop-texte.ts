import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import {
  SHOP_TEXT_KEYS,
  SHOP_TEXT_STANDARD,
  type ShopTextKey,
} from "@/lib/shop-texte";

/**
 * Texte der Sonderseiten: Standard, überschrieben durch Zeilen aus
 * `shop_texte`. Ohne Sitzung gelesen – die Seiten sind öffentlich. Fehlt die
 * Tabelle (Migration 069 nicht eingespielt) oder schlägt die Abfrage fehl,
 * gelten die Standardtexte.
 */
export async function getShopTexte(): Promise<Record<ShopTextKey, string>> {
  const texte = { ...SHOP_TEXT_STANDARD };

  const { data, error } = await createPublicClient()
    .from("shop_texte")
    .select("key, text");
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[shop] Texte:", error.message);
    }
    return texte;
  }

  for (const zeile of data ?? []) {
    const key = zeile.key as ShopTextKey;
    if (SHOP_TEXT_KEYS.includes(key) && zeile.text) texte[key] = zeile.text;
  }
  return texte;
}
