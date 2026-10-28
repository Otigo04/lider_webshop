"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { slideAusFormular, slideSchema, slideZeile } from "@/lib/slide-form";
import { z } from "zod";

/*
 * Banner der Warengruppen (Migration 075). Aufbau wie die Werbebilder der
 * Startseite (lib/actions/home-slides.ts): der Browser lädt das Bild direkt in
 * den Storage (kategorien-banner/<uuid>.<ext>), hier kommt nur der Pfad an.
 */

const bannerSchema = slideSchema("kategorien-banner");
const gruppeSchema = z.string().uuid("Keine Warengruppe ausgewählt.");

function neuLaden() {
  // Welche Warengruppenseite betroffen ist, kennt der Aufrufer nicht ohne
  // zweite Abfrage – die dynamische Route gleich ganz neu laden.
  revalidatePath("/shop/[category]", "page");
  revalidatePath("/admin/startseite/gruppen");
}

export async function saveBanner(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const gruppe = gruppeSchema.safeParse(formData.get("category_id"));
  if (!gruppe.success) return { error: gruppe.error.issues[0].message };
  const parsed = bannerSchema.safeParse(slideAusFormular(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const zeile = slideZeile(d);

  const supabase = await createClient();

  // Altes Bild erst nach dem Speichern aufräumen, sonst zeigte die Zeile
  // kurz ins Leere.
  let alt: { image_path: string; mobile_image_path: string | null } | null = null;
  if (d.id) {
    const { data } = await supabase
      .from("category_banners")
      .select("image_path, mobile_image_path")
      .eq("id", d.id)
      .maybeSingle();
    alt = data;
  }

  let error;
  if (d.id) {
    // Die Warengruppe eines bestehenden Banners ändert sich nicht.
    ({ error } = await supabase.from("category_banners").update(zeile).eq("id", d.id));
  } else {
    // Neue Banner hinten in der Warengruppe anstellen.
    const { data: letzte } = await supabase
      .from("category_banners")
      .select("order_index")
      .eq("category_id", gruppe.data)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase.from("category_banners").insert({
      ...zeile,
      category_id: gruppe.data,
      order_index: (letzte?.order_index ?? -1) + 1,
    }));
  }

  if (error) {
    console.error("[gruppen-banner] speichern:", error.message);
    return { error: "Das Banner konnte nicht gespeichert werden." };
  }

  if (alt) {
    const weg = [alt.image_path, alt.mobile_image_path].filter(
      (p): p is string => Boolean(p) && p !== zeile.image_path && p !== zeile.mobile_image_path,
    );
    if (weg.length > 0) await supabase.storage.from(PRODUCT_BUCKET).remove(weg);
  }

  neuLaden();
  return { success: d.id ? "Banner gespeichert." : "Banner angelegt." };
}

export async function deleteBanner(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Banner ausgewählt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("category_banners")
    .delete()
    .eq("id", id)
    .select("image_path, mobile_image_path")
    .maybeSingle();

  if (error) {
    console.error("[gruppen-banner] löschen:", error.message);
    return { error: "Das Banner konnte nicht gelöscht werden." };
  }
  if (data) {
    const pfade = [data.image_path, data.mobile_image_path].filter(Boolean) as string[];
    await supabase.storage.from(PRODUCT_BUCKET).remove(pfade);
  }

  neuLaden();
  return { success: "Banner gelöscht." };
}

export async function toggleBanner(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const aktiv = formData.get("is_active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("category_banners").update({ is_active: aktiv }).eq("id", id);
  if (error) {
    console.error("[gruppen-banner] umschalten:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }
  neuLaden();
  return { success: aktiv ? "Banner eingeblendet." : "Banner ausgeblendet." };
}

/** Reihenfolge innerhalb der Warengruppe: tauscht mit dem Nachbarn. */
export async function moveBanner(id: string, richtung: "hoch" | "runter"): Promise<AdminFormState> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: eigenes } = await supabase
    .from("category_banners")
    .select("category_id")
    .eq("id", id)
    .maybeSingle();
  if (!eigenes) return { error: "Die Reihenfolge konnte nicht geändert werden." };

  const { data, error } = await supabase
    .from("category_banners")
    .select("id, order_index")
    .eq("category_id", eigenes.category_id)
    .order("order_index")
    .order("created_at");
  if (error || !data) return { error: "Die Reihenfolge konnte nicht geändert werden." };

  const i = data.findIndex((s) => s.id === id);
  const j = richtung === "hoch" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= data.length) return {};

  // Neu durchnummerieren statt nur zwei Werte tauschen: gleiche order_index
  // ließen sich sonst nie trennen.
  const liste = [...data];
  [liste[i], liste[j]] = [liste[j], liste[i]];
  const ergebnisse = await Promise.all(
    liste.map((s, index) =>
      s.order_index === index
        ? null
        : supabase.from("category_banners").update({ order_index: index }).eq("id", s.id),
    ),
  );
  if (ergebnisse.some((r) => r?.error)) {
    return { error: "Die Reihenfolge konnte nicht geändert werden." };
  }

  neuLaden();
  return {};
}
