"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Merkmale von Artikeln (Migration 032).
 *
 * Zwei Ebenen mit zwei Zuständigkeiten: die Definition („Farbe" mit den Werten
 * Rot, Blau, Grün) wird unter /admin/settings einmal gepflegt, die Zuordnung
 * an den Artikel überall dort, wo Artikel entstehen – Artikelformular,
 * Kassendialog, Wareneingang. Deshalb liegen beide hier nebeneinander.
 */

// --- Definition ---------------------------------------------------------------

const attributeSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(60),
  kind: z.enum(["color", "text"]),
});

export async function createProductAttribute(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = attributeSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Neue Merkmale hinten anstellen: die Reihenfolge ist die, in der sie
  // angelegt wurden, und nicht die alphabetische – „Farbe" vor „Material"
  // ist eine Entscheidung des Betriebs, keine des Alphabets.
  const { data: letztes } = await supabase
    .from("product_attributes")
    .select("order_index")
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("product_attributes").insert({
    name: parsed.data.name,
    kind: parsed.data.kind,
    order_index: ((letztes?.order_index as number | undefined) ?? -1) + 1,
  });

  if (error) {
    console.error("[admin] Merkmal anlegen:", error.message);
    return {
      error:
        error.code === "23505"
          ? `Ein Merkmal namens „${parsed.data.name}“ gibt es schon.`
          : "Das Merkmal konnte nicht angelegt werden.",
    };
  }

  merkmaleNeuLaden();
  return { success: "Merkmal angelegt." };
}

/** Löscht Merkmal, Werte und Zuordnungen (ON DELETE CASCADE). */
export async function deleteProductAttribute(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Kein Merkmal ausgewählt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_attributes").delete().eq("id", id);

  if (error) {
    console.error("[admin] Merkmal löschen:", error.message);
    return { error: "Das Merkmal konnte nicht gelöscht werden." };
  }

  merkmaleNeuLaden();
  return { success: "Merkmal gelöscht." };
}

const valueSchema = z.object({
  attribute_id: z.string().uuid("Merkmal fehlt"),
  label: z.string().trim().min(1, "Bezeichnung fehlt").max(60),
  /**
   * Leer heißt „kein Farbwert". Ein Farbmerkmal ohne Hex-Wert bekäme sonst
   * einen schwarzen Kreis, und Schwarz ist eine Farbe und keine Leerstelle.
   */
  hex: z.preprocess(
    (wert) => (wert === "" || wert === undefined ? null : wert),
    z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Farbwert muss die Form #RRGGBB haben")
      .nullable(),
  ),
});

export async function createAttributeValue(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = valueSchema.safeParse({
    attribute_id: formData.get("attribute_id"),
    label: formData.get("label"),
    hex: formData.get("hex"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: letzter } = await supabase
    .from("product_attribute_values")
    .select("order_index")
    .eq("attribute_id", parsed.data.attribute_id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("product_attribute_values").insert({
    attribute_id: parsed.data.attribute_id,
    label: parsed.data.label,
    hex: parsed.data.hex,
    order_index: ((letzter?.order_index as number | undefined) ?? -1) + 1,
  });

  if (error) {
    console.error("[admin] Merkmalswert anlegen:", error.message);
    return {
      error:
        error.code === "23505"
          ? `„${parsed.data.label}“ steht bei diesem Merkmal schon.`
          : "Der Wert konnte nicht angelegt werden.",
    };
  }

  merkmaleNeuLaden();
  return { success: "Wert angelegt." };
}

/**
 * Löscht den Wert und damit seine Zuordnungen. Bewusst ohne Rückfrage nach
 * betroffenen Artikeln: der Wert verschwindet dort, der Artikel bleibt
 * unverändert bestehen – nichts geht verloren außer der Angabe selbst.
 */
export async function deleteAttributeValue(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Kein Wert ausgewählt." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_attribute_values")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin] Merkmalswert löschen:", error.message);
    return { error: "Der Wert konnte nicht gelöscht werden." };
  }

  merkmaleNeuLaden();
  return { success: "Wert gelöscht." };
}

// --- Zuordnung am Artikel -----------------------------------------------------

const linkSchema = z.object({
  productId: z.string().uuid(),
  valueIds: z.array(z.string().uuid()).max(100),
});

export interface AttributeSaveResult {
  error?: string;
}

/**
 * Setzt die Merkmale eines Artikels auf genau diese Werte.
 *
 * Ersetzen statt abgleichen, wie bei Preisstaffeln und Bildern: das Formular
 * ist immer der vollständige Sollzustand. Ein Abgleich Zeile für Zeile brächte
 * dieselbe Wirkung mit mehr Wegen, auf denen etwas hängenbleiben kann.
 *
 * Wird direkt aufgerufen (nicht als useActionState-Formular), weil die
 * Merkmalsauswahl in drei verschiedenen Oberflächen sitzt – Artikelformular,
 * Kassendialog, Wareneingang – und nur eine davon ein Formular ist.
 */
export async function setProductAttributes(input: {
  productId: string;
  valueIds: string[];
}): Promise<AttributeSaveResult> {
  await requireAdmin();

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Ungültige Merkmalsauswahl." };
  }
  const { productId, valueIds } = parsed.data;

  const supabase = await createClient();

  const { error: loeschFehler } = await supabase
    .from("product_attribute_links")
    .delete()
    .eq("product_id", productId);

  if (loeschFehler) {
    console.error("[admin] Merkmale ersetzen:", loeschFehler.message);
    return { error: "Die Merkmale konnten nicht gespeichert werden." };
  }

  if (valueIds.length > 0) {
    const { error } = await supabase.from("product_attribute_links").insert(
      // Doppelte aus der Oberfläche verstoßen gegen den Primärschlüssel und
      // ließen die ganze Buchung auflaufen.
      [...new Set(valueIds)].map((valueId) => ({
        product_id: productId,
        value_id: valueId,
      })),
    );

    if (error) {
      console.error("[admin] Merkmale speichern:", error.message);
      return { error: "Die Merkmale konnten nicht gespeichert werden." };
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath(`/shop/product/${productId}`);
  return {};
}

/** Überall dort, wo Merkmale gelesen werden – Verwaltung wie Sortiment. */
function merkmaleNeuLaden() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/products");
  revalidatePath("/admin/bestand");
  revalidatePath("/shop");
}
