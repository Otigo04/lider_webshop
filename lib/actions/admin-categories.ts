"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

export interface AdminFormState {
  error?: string;
  success?: string;
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name fehlt").max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  order_index: z.coerce.number().int().min(0).max(9999),
  sku_prefix: z
    .string()
    .trim()
    .regex(/^[0-9]{2}$/, "Der Nummernkreis besteht aus genau zwei Ziffern")
    .optional(),
});

export async function saveCategory(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = categorySchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") || undefined,
    order_index: formData.get("order_index") || 0,
    sku_prefix: formData.get("sku_prefix") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, name, description, order_index, sku_prefix } = parsed.data;
  const slug = slugify(parsed.data.slug || name);
  if (!slug) {
    return { error: "Aus dem Namen lässt sich kein Kürzel bilden." };
  }

  const supabase = await createClient();
  const payload = {
    name,
    slug,
    description: description || null,
    order_index,
    // Leer lassen: der Trigger assign_sku_prefix vergibt den nächsten freien.
    ...(sku_prefix ? { sku_prefix } : {}),
  };

  const { error } = id
    ? await supabase.from("categories").update(payload).eq("id", id)
    : await supabase.from("categories").insert(payload);

  if (error) {
    console.error("[admin] Kategorie speichern:", error.message);
    return {
      error:
        error.code === "23505"
          ? error.message.includes("sku_prefix")
            ? `Der Nummernkreis „${sku_prefix}“ ist bereits vergeben.`
            : `Das Kürzel „${slug}“ ist bereits vergeben.`
          : "Die Kategorie konnte nicht gespeichert werden.",
    };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  return { success: id ? "Kategorie aktualisiert." : "Kategorie angelegt." };
}

export async function deleteCategory(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Keine Kategorie ausgewählt." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    console.error("[admin] Kategorie löschen:", error.message);
    // 23503 = Fremdschlüssel: an der Kategorie hängen noch Artikel (ON DELETE
    // RESTRICT). Bewusst so, damit nicht versehentlich der Katalog mitgeht.
    return {
      error:
        error.code === "23503"
          ? "An dieser Kategorie hängen noch Artikel. Erst umhängen oder löschen."
          : "Die Kategorie konnte nicht gelöscht werden.",
    };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  return { success: "Kategorie gelöscht." };
}
