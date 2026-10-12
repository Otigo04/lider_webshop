"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { SHOP_TEXT_KEYS, SHOP_TEXT_MAX } from "@/lib/shop-texte";

const textSchema = z
  .string()
  .trim()
  .max(SHOP_TEXT_MAX, `Höchstens ${SHOP_TEXT_MAX} Zeichen`);

/**
 * Alle vier Texte in einem Formular. Ein leeres Feld löscht die Zeile – dann
 * gilt wieder der Standardtext; es gibt keinen „leeren" Satz unter der
 * Überschrift.
 */
export async function saveShopTexte(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const werte: Record<string, string> = {};
  for (const key of SHOP_TEXT_KEYS) {
    const parsed = textSchema.safeParse(formData.get(key) ?? "");
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    werte[key] = parsed.data;
  }

  const supabase = await createClient();
  const setzen = SHOP_TEXT_KEYS.filter((key) => werte[key] !== "");
  const loeschen = SHOP_TEXT_KEYS.filter((key) => werte[key] === "");

  if (setzen.length > 0) {
    const { error } = await supabase
      .from("shop_texte")
      .upsert(setzen.map((key) => ({ key, text: werte[key] })), { onConflict: "key" });
    if (error) {
      console.error("[admin] Shop-Texte speichern:", error.message);
      return {
        error:
          error.code === "42P01" || error.code === "PGRST205"
            ? "Die Tabelle fehlt noch: Migration 069 im Supabase SQL-Editor ausführen."
            : "Die Texte konnten nicht gespeichert werden.",
      };
    }
  }
  if (loeschen.length > 0) {
    const { error } = await supabase.from("shop_texte").delete().in("key", loeschen);
    if (error) {
      console.error("[admin] Shop-Texte zurücksetzen:", error.message);
      return { error: "Die Texte konnten nicht zurückgesetzt werden." };
    }
  }

  revalidatePath("/admin/settings", "layout");
  for (const key of SHOP_TEXT_KEYS) revalidatePath(`/shop/${key}`);
  return { success: "Texte gespeichert." };
}
