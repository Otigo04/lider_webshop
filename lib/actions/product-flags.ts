"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

const createFlagSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(60),
  color: z.coerce.number().int().min(1).max(6),
});

/** Neues Organisations-Flag anlegen – verwaltet unter /admin/settings. */
export async function createProductFlag(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = createFlagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_flags").insert({
    name: parsed.data.name,
    color: parsed.data.color,
  });

  if (error) {
    console.error("[admin] Flag anlegen:", error.message);
    return {
      error:
        error.code === "23505"
          ? `Ein Flag namens „${parsed.data.name}“ gibt es schon.`
          : "Das Flag konnte nicht angelegt werden.",
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/products");
  return { success: "Flag angelegt." };
}

/** Löscht das Flag und damit auch alle Zuordnungen (ON DELETE CASCADE). */
export async function deleteProductFlag(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Kein Flag ausgewählt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_flags").delete().eq("id", id);

  if (error) {
    console.error("[admin] Flag löschen:", error.message);
    return { error: "Das Flag konnte nicht gelöscht werden." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/products");
  return { success: "Flag gelöscht." };
}

const linkSchema = z.object({
  productId: z.string().uuid(),
  flagId: z.string().uuid(),
  value: z.boolean(),
});

/** Instant-Toggle im Flags-Menü der Artikelliste, wie toggleProductFlag. */
export async function toggleProductFlagLink(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = linkSchema.safeParse({
    productId: formData.get("productId"),
    flagId: formData.get("flagId"),
    value: formData.get("value") === "true",
  });
  if (!parsed.success) {
    return { error: "Ungültiger Wert." };
  }

  const supabase = await createClient();
  const { productId, flagId, value } = parsed.data;

  const { error } = value
    ? await supabase.from("product_flag_links").insert({ product_id: productId, flag_id: flagId })
    : await supabase
        .from("product_flag_links")
        .delete()
        .eq("product_id", productId)
        .eq("flag_id", flagId);

  if (error) {
    console.error("[admin] Flag-Zuordnung ändern:", error.message);
    return { error: "Konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/products");
  return { success: "Gespeichert." };
}
