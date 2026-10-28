"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { slideAusFormular, slideSchema, slideZeile } from "@/lib/slide-form";

/*
 * Werbebilder der Startseite (Migration 055). Die Bilder lädt der Browser
 * direkt in den Storage (startseite/<uuid>.<ext>), hier kommt nur der Pfad an
 * – wie beim Kachelbild der Warengruppe.
 */

const werbebildSchema = slideSchema("startseite");

function neuLaden() {
  revalidatePath("/");
  revalidatePath("/admin/startseite");
}

export async function saveSlide(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = werbebildSchema.safeParse(slideAusFormular(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const zeile = slideZeile(d);

  const supabase = await createClient();

  // Beim Austauschen eines Bildes die alte Datei aufräumen – erst nachdem der
  // neue Pfad gespeichert ist, sonst zeigte die Zeile kurz ins Leere.
  let alt: { image_path: string; mobile_image_path: string | null } | null = null;
  if (d.id) {
    const { data } = await supabase
      .from("home_slides")
      .select("image_path, mobile_image_path")
      .eq("id", d.id)
      .maybeSingle();
    alt = data;
  }

  let error;
  if (d.id) {
    ({ error } = await supabase.from("home_slides").update(zeile).eq("id", d.id));
  } else {
    // Neue Bilder hinten anstellen.
    const { data: letzte } = await supabase
      .from("home_slides")
      .select("order_index")
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("home_slides")
      .insert({ ...zeile, order_index: (letzte?.order_index ?? -1) + 1 }));
  }

  if (error) {
    console.error("[slider] speichern:", error.message);
    return { error: "Das Werbebild konnte nicht gespeichert werden." };
  }

  if (alt) {
    const weg = [alt.image_path, alt.mobile_image_path].filter(
      (p): p is string => Boolean(p) && p !== zeile.image_path && p !== zeile.mobile_image_path,
    );
    if (weg.length > 0) await supabase.storage.from(PRODUCT_BUCKET).remove(weg);
  }

  neuLaden();
  return { success: d.id ? "Werbebild gespeichert." : "Werbebild angelegt." };
}

export async function deleteSlide(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Werbebild ausgewählt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_slides")
    .delete()
    .eq("id", id)
    .select("image_path, mobile_image_path")
    .maybeSingle();

  if (error) {
    console.error("[slider] löschen:", error.message);
    return { error: "Das Werbebild konnte nicht gelöscht werden." };
  }
  if (data) {
    const pfade = [data.image_path, data.mobile_image_path].filter(Boolean) as string[];
    await supabase.storage.from(PRODUCT_BUCKET).remove(pfade);
  }

  neuLaden();
  return { success: "Werbebild gelöscht." };
}

export async function toggleSlide(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const aktiv = formData.get("is_active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("home_slides").update({ is_active: aktiv }).eq("id", id);
  if (error) {
    console.error("[slider] umschalten:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }
  neuLaden();
  return { success: aktiv ? "Werbebild eingeblendet." : "Werbebild ausgeblendet." };
}

/** Reihenfolge verschieben: tauscht mit dem Nachbarn oben oder unten. */
export async function moveSlide(id: string, richtung: "hoch" | "runter"): Promise<AdminFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_slides")
    .select("id, order_index")
    .order("order_index")
    .order("created_at");
  if (error || !data) return { error: "Die Reihenfolge konnte nicht geändert werden." };

  const i = data.findIndex((s) => s.id === id);
  const j = richtung === "hoch" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= data.length) return {};

  // Neu durchnummerieren statt nur zwei Werte tauschen: gleiche order_index
  // (z. B. zwei Zeilen mit 0) ließen sich sonst nie trennen.
  const liste = [...data];
  [liste[i], liste[j]] = [liste[j], liste[i]];
  const ergebnisse = await Promise.all(
    liste.map((s, index) =>
      s.order_index === index
        ? null
        : supabase.from("home_slides").update({ order_index: index }).eq("id", s.id),
    ),
  );
  if (ergebnisse.some((r) => r?.error)) {
    return { error: "Die Reihenfolge konnte nicht geändert werden." };
  }

  neuLaden();
  return {};
}
