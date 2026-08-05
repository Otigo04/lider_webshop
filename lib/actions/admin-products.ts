"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_BUCKET } from "@/lib/constants";
import type { AdminFormState } from "@/lib/actions/admin-categories";

const tierSchema = z.object({
  min_quantity: z.coerce.number().int().positive("Mindestmenge muss > 0 sein"),
  max_quantity: z.coerce.number().int().positive().nullable(),
  unit_price: z.coerce.number().min(0, "Preis darf nicht negativ sein"),
});

const imageSchema = z.object({
  file_path: z.string().min(1),
  display_order: z.coerce.number().int().min(0),
});

const productSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid("Kategorie fehlt"),
  sku: z.string().trim().min(1, "Artikelnummer fehlt").max(60),
  name: z.string().trim().min(1, "Name fehlt").max(200),
  description: z.string().trim().max(5000).optional(),
  is_active: z.boolean(),
  stock_available: z.coerce.number().int().min(0),
  tiers: z.array(tierSchema).min(1, "Mindestens eine Preisstaffel angeben"),
  images: z.array(imageSchema),
});

/**
 * Legt an oder aktualisiert. Die ID kommt vom Client, weil Bilder schon vor dem
 * Speichern in den Ordner products/<id>/ hochgeladen werden – so muss beim
 * Anlegen nichts nachträglich umgehängt werden.
 *
 * Staffeln und Bildzuordnungen werden komplett ersetzt statt einzeln
 * abgeglichen: das Formular ist immer der vollständige Sollzustand.
 */
export async function saveProduct(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "Die Formulardaten konnten nicht gelesen werden." };
  }

  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;

  // Staffeln müssen sich eindeutig zuordnen lassen.
  const mins = data.tiers.map((tier) => tier.min_quantity);
  if (new Set(mins).size !== mins.length) {
    return { error: "Zwei Staffeln haben dieselbe Mindestmenge." };
  }
  for (const tier of data.tiers) {
    if (tier.max_quantity !== null && tier.max_quantity < tier.min_quantity) {
      return { error: "Höchstmenge liegt unter der Mindestmenge." };
    }
  }

  const supabase = await createClient();

  const { error: upsertError } = await supabase.from("products").upsert({
    id: data.id,
    category_id: data.category_id,
    sku: data.sku,
    name: data.name,
    description: data.description || null,
    is_active: data.is_active,
    stock_available: data.stock_available,
    created_by: admin.id,
  });

  if (upsertError) {
    console.error("[admin] Artikel speichern:", upsertError.message);
    return {
      error:
        upsertError.code === "23505"
          ? `Die Artikelnummer „${data.sku}“ ist bereits vergeben.`
          : "Der Artikel konnte nicht gespeichert werden.",
    };
  }

  await supabase.from("product_variants").delete().eq("product_id", data.id);
  const { error: tierError } = await supabase.from("product_variants").insert(
    data.tiers.map((tier) => ({
      product_id: data.id,
      min_quantity: tier.min_quantity,
      max_quantity: tier.max_quantity,
      unit_price: tier.unit_price,
    })),
  );
  if (tierError) {
    console.error("[admin] Staffeln speichern:", tierError.message);
    return { error: "Die Preisstaffeln konnten nicht gespeichert werden." };
  }

  await supabase.from("product_images").delete().eq("product_id", data.id);
  if (data.images.length > 0) {
    const { error: imageError } = await supabase.from("product_images").insert(
      data.images.map((image) => ({
        product_id: data.id,
        file_path: image.file_path,
        display_order: image.display_order,
      })),
    );
    if (imageError) {
      console.error("[admin] Bilder speichern:", imageError.message);
      return { error: "Die Bildzuordnung konnte nicht gespeichert werden." };
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath(`/shop/product/${data.id}`);
  return { success: "Artikel gespeichert." };
}

export async function deleteProduct(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Artikel ausgewählt." };

  const supabase = await createClient();

  // Erst die Dateien, dann die Zeile: product_images hängt per CASCADE am
  // Artikel, danach wären die Pfade nicht mehr ermittelbar.
  const { data: images } = await supabase
    .from("product_images")
    .select("file_path")
    .eq("product_id", id);

  if (images && images.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .remove(images.map((image) => image.file_path as string));
    if (storageError) {
      console.error("[admin] Bilder löschen:", storageError.message);
    }
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    console.error("[admin] Artikel löschen:", error.message);
    return { error: "Der Artikel konnte nicht gelöscht werden." };
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: "Artikel gelöscht." };
}
