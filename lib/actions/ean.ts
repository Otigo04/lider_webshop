"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { ladeBild, sucheEan, type EanTreffer } from "@/lib/ean-lookup";
import { createClient } from "@/lib/supabase/server";

/**
 * Barcode nachschlagen – für den Wareneingang, wenn der Artikelstamm den Code
 * nicht kennt. Kein Treffer ist ein normaler Ausgang, ebenso eine Quelle, die
 * gerade nicht antwortet: in beiden Fällen wird die Bezeichnung getippt.
 */
export async function lookupEan(code: string): Promise<EanTreffer | null> {
  await requireAdmin();
  try {
    return await sucheEan(code.trim().slice(0, 14));
  } catch (fehler) {
    console.error("[ean] Nachschlagen:", fehler);
    return null;
  }
}

const bildSchema = z.object({
  productId: z.string().uuid(),
  barcode: z.string().trim().regex(/^\d{8,14}$/),
});

/**
 * Das gefundene Produktfoto an einen frisch angelegten Artikel hängen.
 *
 * Übergeben wird der Barcode, nicht die Bildadresse: welche Adresse der
 * Server abruft, entscheidet er selbst aus dem Nachschlag und nicht der
 * Browser. Ein Artikel, der schon ein Foto hat, bleibt unberührt – ein
 * eigenes Foto ist immer besser als das der Datenbank.
 */
export async function uebernehmeArtikelbild(
  input: z.input<typeof bildSchema>,
): Promise<{ ok: boolean }> {
  await requireAdmin();

  const parsed = bildSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { productId, barcode } = parsed.data;

  try {
    const treffer = await sucheEan(barcode);
    if (!treffer?.bildUrl) return { ok: false };

    const supabase = await createClient();

    const { count } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if ((count ?? 0) > 0) return { ok: false };

    const bild = await ladeBild(treffer.bildUrl);
    if (!bild) return { ok: false };

    const pfad = `${productId}/${crypto.randomUUID()}.${bild.endung}`;
    const { error: uploadFehler } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .upload(pfad, bild.bytes, { contentType: bild.contentType });
    if (uploadFehler) {
      console.error("[ean] Bild ablegen:", uploadFehler.message);
      return { ok: false };
    }

    const { error: zeilenFehler } = await supabase
      .from("product_images")
      .insert({ product_id: productId, file_path: pfad, display_order: 0 });
    if (zeilenFehler) {
      console.error("[ean] Bild zuordnen:", zeilenFehler.message);
      // Datei ohne Zeile wäre Müll im Bucket, den niemand mehr findet.
      await supabase.storage.from(PRODUCT_BUCKET).remove([pfad]);
      return { ok: false };
    }

    revalidatePath("/admin/products");
    revalidatePath("/shop");
    return { ok: true };
  } catch (fehler) {
    console.error("[ean] Bild übernehmen:", fehler);
    return { ok: false };
  }
}
