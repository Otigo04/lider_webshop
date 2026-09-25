"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { MASS_GRENZEN } from "@/lib/preisschild";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Symbolbibliothek der Preisschilder (Migration 038).
 *
 * Die Datei selbst geht direkt aus dem Browser in den Storage – wie beim
 * Kategoriebild. Hier landet nur der Pfad: ein Bild durch eine
 * Formularübertragung zu schicken wäre der Umweg.
 */

/** Nur Pfade in `etiketten/`. Sonst ließe sich jede Bucket-Datei eintragen. */
const pfadSchema = z
  .string()
  .trim()
  .regex(/^etiketten\/[\w./-]+$/, "Ungültiger Pfad.");

const iconSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(60, "Höchstens 60 Zeichen"),
  path: pfadSchema,
});

export async function createLabelIcon(input: {
  name: string;
  path: string;
}): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = iconSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("label_icons")
    .insert({ name: parsed.data.name, file_path: parsed.data.path });

  if (error) {
    console.error("[preisschilder] Symbol anlegen:", error.message);
    return { error: "Das Symbol konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/preisschilder");
  return { success: "Symbol gespeichert." };
}

/**
 * Symbol entfernen – Zeile und Datei.
 *
 * Erst die Datei, dann die Zeile wäre die falsche Reihenfolge: bricht es
 * dazwischen ab, stünde in der Bibliothek ein Symbol, dessen Bild fehlt. So
 * bleibt im schlechtesten Fall eine verwaiste Datei im Bucket zurück, und die
 * sieht niemand.
 */
export async function deleteLabelIcon(id: string): Promise<AdminFormState> {
  await requireAdmin();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Kein Symbol ausgewählt." };
  }

  const supabase = await createClient();
  const { data: zeile } = await supabase
    .from("label_icons")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("label_icons").delete().eq("id", id);
  if (error) {
    console.error("[preisschilder] Symbol löschen:", error.message);
    return { error: "Das Symbol konnte nicht gelöscht werden." };
  }

  const pfad = (zeile as { file_path: string } | null)?.file_path;
  if (pfad) {
    await supabase.storage.from(PRODUCT_BUCKET).remove([pfad]);
  }

  revalidatePath("/admin/preisschilder");
  return { success: "Symbol gelöscht." };
}

// --- Schildgrößen (Migration 039) -------------------------------------------

/**
 * Maße in Millimetern, auf eine Nachkommastelle.
 *
 * Die Grenzen sind dieselben wie im CHECK der Tabelle: die Nutzfläche eines
 * A4-Bogens innerhalb des Druckrands. Ein Schild, das nicht aufs Blatt passt,
 * ließe sich anlegen, aber nie drucken.
 */
const massSchema = (max: number) =>
  z.coerce
    .number()
    .min(MASS_GRENZEN.min, `Mindestens ${MASS_GRENZEN.min} mm.`)
    .max(max, `Höchstens ${max} mm – so breit ist der Bogen.`)
    .transform((wert) => Math.round(wert * 10) / 10);

const groesseSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(40, "Höchstens 40 Zeichen"),
  breite: massSchema(MASS_GRENZEN.maxBreite),
  hoehe: massSchema(MASS_GRENZEN.maxHoehe),
});

export async function createLabelSize(input: {
  name: string;
  breite: number;
  hoehe: number;
}): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = groesseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Ans Ende der Liste: die Reihenfolge ist die des Anlegens, und eine neue
  // Größe soll die gewohnte Reihe nicht durcheinanderbringen.
  const { data: letzte } = await supabase
    .from("label_sizes")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("label_sizes").insert({
    name: parsed.data.name,
    width_mm: parsed.data.breite,
    height_mm: parsed.data.hoehe,
    order_index: ((letzte as { order_index: number } | null)?.order_index ?? -1) + 1,
  });

  if (error) {
    console.error("[preisschilder] Größe anlegen:", error.message);
    return { error: "Die Größe konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/preisschilder");
  return { success: `Größe „${parsed.data.name}" gespeichert.` };
}

export async function updateLabelSize(input: {
  id: string;
  name: string;
  breite: number;
  hoehe: number;
}): Promise<AdminFormState> {
  await requireAdmin();

  if (!z.string().uuid().safeParse(input.id).success) {
    return { error: "Keine Größe ausgewählt." };
  }
  const parsed = groesseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("label_sizes")
    .update({
      name: parsed.data.name,
      width_mm: parsed.data.breite,
      height_mm: parsed.data.hoehe,
    })
    .eq("id", input.id);

  if (error) {
    console.error("[preisschilder] Größe ändern:", error.message);
    return { error: "Die Größe konnte nicht geändert werden." };
  }

  revalidatePath("/admin/preisschilder");
  return { success: "Größe gespeichert." };
}

/**
 * Größe löschen.
 *
 * Die letzte lässt sich nicht löschen: ohne Format ließe sich kein Schild
 * mehr drucken, und die Seite fiele auf die Vorgaben zurück – was aussähe,
 * als wären die gelöschten Größen wieder da.
 */
export async function deleteLabelSize(id: string): Promise<AdminFormState> {
  await requireAdmin();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Keine Größe ausgewählt." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("label_sizes")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) <= 1) {
    return { error: "Die letzte Größe lässt sich nicht löschen." };
  }

  const { error } = await supabase.from("label_sizes").delete().eq("id", id);
  if (error) {
    console.error("[preisschilder] Größe löschen:", error.message);
    return { error: "Die Größe konnte nicht gelöscht werden." };
  }

  revalidatePath("/admin/preisschilder");
  return { success: "Größe gelöscht." };
}

// --- Labelfarben (Migration 040) --------------------------------------------

const labelFarbeSchema = z.object({
  key: z.string().regex(/^(neu|topseller|flag:[0-9a-f-]{36})$/, "Unbekanntes Label."),
  farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe."),
});

/** Farbe eines Labels speichern – gilt ab dann für alle Preisschilder. */
export async function setLabelFarbe(input: {
  key: string;
  farbe: string;
}): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = labelFarbeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("label_badge_colors").upsert({
    badge_key: parsed.data.key,
    color: parsed.data.farbe.toLowerCase(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[preisschilder] Labelfarbe:", error.message);
    return {
      error:
        error.code === "42P01"
          ? "Migration 040 fehlt – Farbe nicht gespeichert."
          : "Die Farbe konnte nicht gespeichert werden.",
    };
  }

  revalidatePath("/admin/preisschilder");
  return { success: "Farbe gespeichert." };
}
