"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/*
 * Ein Link ist entweder ein Pfad der eigenen Seite (/shop/reduziert) oder eine
 * volle https-Adresse. javascript: und Ähnliches fällt damit von selbst raus.
 */
const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (wert) => /^\/(?!\/)/.test(wert) || /^https?:\/\//i.test(wert),
    "Link muss mit / oder https:// beginnen",
  );

const bannerSchema = z.object({
  message: z.string().trim().min(1, "Text fehlt").max(160, "Höchstens 160 Zeichen"),
  link_url: linkSchema.optional(),
  link_label: z.string().trim().max(40, "Linktext höchstens 40 Zeichen").optional(),
  tone: z.enum(["brand", "gold", "signal"]),
  is_active: z.boolean(),
  order_index: z.coerce.number().int().min(0).max(999),
});

function lesen(formData: FormData) {
  return bannerSchema.safeParse({
    message: formData.get("message") ?? "",
    link_url: formData.get("link_url") || undefined,
    link_label: formData.get("link_label") || undefined,
    tone: formData.get("tone") || "gold",
    is_active: formData.get("is_active") === "on",
    order_index: formData.get("order_index") || 0,
  });
}

function neuLaden() {
  // Die Leiste steht im Wurzellayout – jede Seite zeigt sie.
  revalidatePath("/", "layout");
}

export async function createSiteBanner(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const parsed = lesen(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { link_url, link_label, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("site_banners").insert({
    ...rest,
    link_url: link_url || null,
    link_label: link_url ? link_label || null : null,
  });

  if (error) {
    console.error("[admin] Hinweis anlegen:", error.message);
    return { error: "Der Hinweis konnte nicht angelegt werden." };
  }
  neuLaden();
  return { success: "Hinweis angelegt." };
}

export async function updateSiteBanner(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Kein Hinweis ausgewählt." };
  }
  const parsed = lesen(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { link_url, link_label, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_banners")
    .update({
      ...rest,
      link_url: link_url || null,
      link_label: link_url ? link_label || null : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[admin] Hinweis speichern:", error.message);
    return { error: "Der Hinweis konnte nicht gespeichert werden." };
  }
  neuLaden();
  return { success: "Hinweis gespeichert." };
}

export async function deleteSiteBanner(id: string): Promise<AdminFormState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Kein Hinweis ausgewählt." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("site_banners").delete().eq("id", id);
  if (error) {
    console.error("[admin] Hinweis löschen:", error.message);
    return { error: "Der Hinweis konnte nicht gelöscht werden." };
  }
  neuLaden();
  return { success: "Hinweis gelöscht." };
}
