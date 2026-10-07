"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/*
 * Kassenbuch (Migration 057): Tageskasse von Hand, eine Zeile je Datum.
 * Ein zweiter Eintrag für denselben Tag überschreibt den ersten.
 */

/** Leeres Feld = 0. Komma oder Punkt als Dezimaltrenner. */
const betrag = z.preprocess(
  (v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", "."))),
  z
    .number({ error: "Bitte gültige Beträge eingeben." })
    .finite("Bitte gültige Beträge eingeben.")
    .min(0, "Beträge dürfen nicht negativ sein.")
    .max(9_999_999, "Betrag zu groß."),
);

const eintragSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen."),
  cash: betrag,
  card: betrag,
  wholesale: betrag,
  note: z.string().trim().max(300, "Notiz: höchstens 300 Zeichen.").optional(),
});

export async function saveCashEntry(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const parsed = eintragSchema.safeParse({
    entry_date: formData.get("entry_date"),
    cash: formData.get("cash"),
    card: formData.get("card"),
    wholesale: formData.get("wholesale"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("cash_entries").upsert(
    {
      entry_date: d.entry_date,
      cash: Math.round(d.cash * 100) / 100,
      card: Math.round(d.card * 100) / 100,
      wholesale: Math.round(d.wholesale * 100) / 100,
      note: d.note || null,
      created_by: admin.id,
    },
    { onConflict: "entry_date" },
  );

  if (error) {
    console.error("[kassenbuch] speichern:", error.code, error.message);
    return { error: "Der Eintrag konnte nicht gespeichert werden." };
  }
  revalidatePath("/admin/kassenbuch");
  return { success: "Eintrag gespeichert." };
}

export async function deleteCashEntry(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Eintrag ausgewählt." };

  const supabase = await createClient();
  const { error } = await supabase.from("cash_entries").delete().eq("id", id);
  if (error) {
    console.error("[kassenbuch] löschen:", error.message);
    return { error: "Der Eintrag konnte nicht gelöscht werden." };
  }
  revalidatePath("/admin/kassenbuch");
  return { success: "Eintrag gelöscht." };
}
