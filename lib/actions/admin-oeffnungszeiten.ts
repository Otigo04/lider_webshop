"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { WOCHENTAGE, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

const tagSchema = z.object({
  geschlossen: z.boolean(),
  open: z.string(),
  close: z.string(),
});

export async function updateOeffnungszeiten(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const tage = WOCHENTAGE.map((_, i) =>
    tagSchema.parse({
      geschlossen: formData.get(`tag${i}_zu`) === "on",
      open: String(formData.get(`tag${i}_open`) ?? ""),
      close: String(formData.get(`tag${i}_close`) ?? ""),
    }),
  );

  const wert: Oeffnungszeiten = [];
  for (const [i, tag] of tage.entries()) {
    if (tag.geschlossen) {
      wert.push(null);
      continue;
    }
    if (!ZEIT.test(tag.open) || !ZEIT.test(tag.close)) {
      return { error: `${WOCHENTAGE[i]}: Bitte Zeiten im Format HH:MM angeben.` };
    }
    if (tag.open >= tag.close) {
      return { error: `${WOCHENTAGE[i]}: Öffnung muss vor Schluss liegen.` };
    }
    wert.push({ open: tag.open, close: tag.close });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({ opening_hours: wert })
    .eq("id", true);

  if (error?.code === "PGRST204" || error?.code === "42703") {
    return {
      error:
        "Die Tabelle kennt Öffnungszeiten noch nicht. Bitte supabase/migrations/071_oeffnungszeiten.sql im Supabase SQL-Editor ausführen.",
    };
  }
  if (error) {
    console.error("[admin] Öffnungszeiten speichern:", error.message);
    return { error: "Die Öffnungszeiten konnten nicht gespeichert werden." };
  }

  revalidatePath("/", "layout");
  return { success: "Öffnungszeiten gespeichert." };
}
