"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { reduzierung } from "@/lib/pricing";
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
  /** EAN/UPC vom Etikett – Grundlage für den Scanner an der Ladenkasse */
  barcode: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1, "Name fehlt").max(200),
  description: z.string().trim().max(5000).optional(),
  is_active: z.boolean(),
  stock_available: z.coerce.number().int().min(0),
  /** Ladenpreis für Privatkunden an der Kasse. Leer = nicht gepflegt. */
  retail_price: z.preprocess(
    (wert) => (wert === "" || wert === null || wert === undefined ? null : wert),
    z.coerce
      .number({ message: "Ladenpreis muss eine Zahl sein" })
      .min(0, "Ladenpreis darf nicht negativ sein")
      .max(1_000_000)
      .nullable(),
  ),
  /**
   * Einkaufspreis (Migration 047), nur fürs Haus. Leer = nicht gepflegt und
   * löscht die Zeile in product_costs.
   */
  cost_price: z.preprocess(
    (wert) => (wert === "" || wert === null || wert === undefined ? null : wert),
    z.coerce
      .number({ message: "Einkaufspreis muss eine Zahl sein" })
      .min(0, "Einkaufspreis darf nicht negativ sein")
      .max(1_000_000)
      .nullable(),
  ),
  /** Vorher-Preis für die Rabattanzeige. Leer = nicht reduziert. */
  list_price: z.preprocess(
    (wert) => (wert === "" || wert === null || wert === undefined ? null : wert),
    z.coerce
      .number({ message: "Vorher-Preis muss eine Zahl sein" })
      .min(0, "Vorher-Preis darf nicht negativ sein")
      .max(1_000_000)
      .nullable(),
  ),
  tiers: z.array(tierSchema).min(1, "Mindestens eine Preisstaffel angeben"),
  images: z.array(imageSchema),
  /** Merkmalswerte (Migration 032). Fehlt das Feld, bleiben sie unangetastet. */
  attribute_value_ids: z.array(z.string().uuid()).max(100).optional(),
  /**
   * Artikelgruppe (Migration 033). Leerstring aus dem Auswahlfeld heißt
   * „gehört zu keinem Angebot" – als null, nicht als leere UUID.
   */
  group_id: z.preprocess(
    (wert) => (wert === "" || wert === undefined ? null : wert),
    z.string().uuid("Ungültige Gruppe").nullable(),
  ),
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

  // Artikelnummern werden nicht eingetippt, sondern aus dem Nummernkreis der
  // Kategorie gezogen (12-0001). Bestehende Artikel behalten ihre Nummer,
  // auch wenn die Kategorie später wechselt – sonst wären Lieferscheine und
  // Bestellhistorie nicht mehr nachvollziehbar.
  const { data: existing } = await supabase
    .from("products")
    .select("sku")
    .eq("id", data.id)
    .maybeSingle();

  let sku = existing?.sku as string | undefined;

  if (!sku) {
    const { data: generated, error: skuError } = await supabase.rpc("next_sku", {
      p_category_id: data.category_id,
    });
    if (skuError || !generated) {
      console.error("[admin] Artikelnummer:", skuError?.message);
      return {
        error:
          skuError?.message ?? "Es konnte keine Artikelnummer vergeben werden.",
      };
    }
    sku = generated as string;
  }

  const { error: upsertError } = await supabase.from("products").upsert({
    id: data.id,
    category_id: data.category_id,
    group_id: data.group_id,
    sku,
    barcode: data.barcode || null,
    name: data.name,
    description: data.description || null,
    is_active: data.is_active,
    stock_available: data.stock_available,
    retail_price: data.retail_price,
    list_price: data.list_price,
    created_by: admin.id,
  });

  if (upsertError) {
    console.error("[admin] Artikel speichern:", upsertError.message);
    return {
      error:
        upsertError.code === "23505"
          ? upsertError.message.includes("barcode")
            ? `Der Barcode „${data.barcode}“ ist bereits einem anderen Artikel zugeordnet.`
            : `Die Artikelnummer „${sku}“ ist bereits vergeben. Bitte erneut speichern.`
          : "Der Artikel konnte nicht gespeichert werden.",
    };
  }

  /*
   * Einkaufspreis in die eigene Tabelle (Migration 047), nicht an products:
   * dort wäre er für jeden angemeldeten Kunden lesbar. Leeres Feld heißt
   * „nicht gepflegt" und löscht die Zeile – eine 0 wäre an der Kasse eine
   * Marge von 100 %.
   */
  const { error: ekFehler } =
    data.cost_price === null
      ? await supabase.from("product_costs").delete().eq("product_id", data.id)
      : await supabase.from("product_costs").upsert(
          {
            product_id: data.id,
            cost_price: data.cost_price,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "product_id" },
        );
  if (ekFehler) {
    console.error("[admin] Einkaufspreis speichern:", ekFehler.message);
    return { error: "Der Einkaufspreis konnte nicht gespeichert werden." };
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

  // Merkmale wie Staffeln und Bilder: ersetzen statt abgleichen – das
  // Formular ist der vollständige Sollzustand. Ein fehlendes Feld heißt
  // dagegen „nicht angefasst"; das Kassenformular schickt keine Merkmale mit
  // und darf die vorhandenen nicht leer räumen.
  if (data.attribute_value_ids) {
    await supabase
      .from("product_attribute_links")
      .delete()
      .eq("product_id", data.id);

    if (data.attribute_value_ids.length > 0) {
      const { error: merkmalFehler } = await supabase
        .from("product_attribute_links")
        .insert(
          [...new Set(data.attribute_value_ids)].map((valueId) => ({
            product_id: data.id,
            value_id: valueId,
          })),
        );
      if (merkmalFehler) {
        console.error("[admin] Merkmale speichern:", merkmalFehler.message);
        return { error: "Die Merkmale konnten nicht gespeichert werden." };
      }
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath(`/shop/product/${data.id}`);
  return { success: "Artikel gespeichert." };
}

const PRODUCT_FLAGS = ["is_new", "is_topseller"] as const;
export type ProductFlag = (typeof PRODUCT_FLAGS)[number];

const flagSchema = z.object({
  id: z.string().uuid(),
  flag: z.enum(PRODUCT_FLAGS),
  value: z.boolean(),
});

/** Instant-Toggle im Flags-Menü der Artikelliste – kein Bestätigungsdialog, nicht destruktiv. */
export async function toggleProductFlag(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = flagSchema.safeParse({
    id: formData.get("id"),
    flag: formData.get("flag"),
    value: formData.get("value") === "true",
  });
  if (!parsed.success) {
    return { error: "Ungültiger Wert." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ [parsed.data.flag]: parsed.data.value })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] Flag ändern:", error.message);
    return { error: "Konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/products");
  revalidatePath("/");
  return { success: "Gespeichert." };
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

// --- Inline-Bearbeitung in der Artikelliste ---------------------------------

/**
 * Einzelnes Feld direkt in der Tabelle ändern.
 *
 * Bewusst feldweise statt als Teilformular: in der Liste wird typischerweise
 * genau eine Zahl korrigiert (Bestand nach der Inventur, Preis nach der
 * Lieferantenmeldung). Ein ganzes Formular dafür zu öffnen kostet mehr Zeit
 * als die Korrektur selbst.
 *
 * Jedes Feld hat sein eigenes Schema – ein generisches "value: any" wäre die
 * offene Tür, über die sich später auch is_admin setzen ließe.
 */
const inlineFieldSchemas = {
  name: z.string().trim().min(1, "Bezeichnung darf nicht leer sein").max(200),
  barcode: z.string().trim().max(64),
  category_id: z.string().uuid("Warengruppe fehlt"),
  stock_available: z.coerce
    .number({ message: "Bestand muss eine Zahl sein" })
    .int("Bestand muss eine ganze Zahl sein")
    .min(0, "Bestand darf nicht negativ sein")
    .max(10_000_000),
  unit_price: z.coerce
    .number({ message: "Preis muss eine Zahl sein" })
    .min(0, "Preis darf nicht negativ sein")
    .max(1_000_000),
  retail_price: z.preprocess(
    (wert) => (wert === "" ? null : wert),
    z.coerce
      .number({ message: "Ladenpreis muss eine Zahl sein" })
      .min(0, "Ladenpreis darf nicht negativ sein")
      .max(1_000_000)
      .nullable(),
  ),
  list_price: z.preprocess(
    (wert) => (wert === "" ? null : wert),
    z.coerce
      .number({ message: "Vorher-Preis muss eine Zahl sein" })
      .min(0, "Vorher-Preis darf nicht negativ sein")
      .max(1_000_000)
      .nullable(),
  ),
  /**
   * Einkaufspreis (Migration 047). Steht in product_costs und nicht an
   * products – leeres Feld heißt „keiner gepflegt" und löscht die Zeile.
   */
  cost_price: z.preprocess(
    (wert) => (wert === "" ? null : wert),
    z.coerce
      .number({ message: "Einkaufspreis muss eine Zahl sein" })
      .min(0, "Einkaufspreis darf nicht negativ sein")
      .max(1_000_000)
      .nullable(),
  ),
} as const;

export type InlineField = keyof typeof inlineFieldSchemas;

export interface InlineUpdateState {
  error?: string;
  success?: string;
}

/**
 * Ladenpreis und Streichpreis eines Artikels in einem Schritt setzen – der
 * Weg des Preisschild-Generators.
 *
 * **Eine Schreibung für beide Spalten.** Ob ein Artikel reduziert ist, folgt
 * aus dem Paar `list_price` > `retail_price` (reduzierung()). Zwei getrennte
 * Schreibungen ließen zwischen ihnen einen Zustand stehen, in dem der Artikel
 * mit halbem Paar im Shop, im Katalog und auf der Kasse falsch reduziert wäre.
 *
 * **Der Streichpreis wird nur gespeichert, wenn daraus eine Reduzierung wird**
 * (derselbe Test wie auf dem Schild: ein Cent Unterschied ist kein Angebot).
 * Sonst wird er gelöscht: ein regulärer Preis hat keinen Vorher-Preis, und
 * ein übrig gebliebener würde den Artikel still weiter als reduziert führen.
 */
export async function setzeAktionspreis(input: {
  id: string;
  preis: number;
  vorher: number | null;
}): Promise<InlineUpdateState & { reduziert?: number | null }> {
  await requireAdmin();

  const eingabe = z
    .object({
      id: z.string().uuid(),
      preis: z.number().positive("Preis muss größer als 0 sein").max(1_000_000),
      vorher: z.number().positive().max(1_000_000).nullable(),
    })
    .safeParse(input);
  if (!eingabe.success) {
    return { error: eingabe.error.issues[0].message };
  }

  const { id, preis, vorher } = eingabe.data;
  const r = reduzierung(vorher, preis, preis);

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ retail_price: preis, list_price: r ? r.vorher : null })
    .eq("id", id);
  if (error) {
    console.error("[admin] Aktionspreis speichern:", error.message);
    return { error: "Der Preis konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/admin/preisschilder");
  revalidatePath("/admin/kataloge");
  revalidatePath("/shop");
  revalidatePath(`/shop/product/${id}`);
  return { success: "Gespeichert.", reduziert: r ? r.prozent : null };
}

/**
 * `field` kommt als string herein, nicht als Union: die aufrufende
 * Inline-Zelle wird auch für Kategorien verwendet und kann keine
 * artikelspezifische Typunion kennen. Geprüft wird hier – ein unbekannter
 * Feldname fällt durch, bevor irgendetwas geschrieben wird.
 */
export async function updateProductField(input: {
  id: string;
  field: string;
  value: string;
}): Promise<InlineUpdateState> {
  await requireAdmin();

  if (!z.string().uuid().safeParse(input.id).success) {
    return { error: "Kein Artikel ausgewählt." };
  }

  if (!Object.hasOwn(inlineFieldSchemas, input.field)) {
    return { error: "Unbekanntes Feld." };
  }
  const feld = input.field as InlineField;
  const schema = inlineFieldSchemas[feld];

  const parsed = schema.safeParse(input.value);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Der Preis hängt nicht am Artikel, sondern an der kleinsten Preisstaffel.
  if (feld === "unit_price") {
    const preis = parsed.data as number;
    const { data: staffeln, error: leseFehler } = await supabase
      .from("product_variants")
      .select("id, min_quantity")
      .eq("product_id", input.id)
      .order("min_quantity")
      .limit(1);

    if (leseFehler) {
      console.error("[admin] Staffel lesen:", leseFehler.message);
      return { error: "Der Preis konnte nicht gespeichert werden." };
    }

    const fehler = staffeln?.length
      ? (
          await supabase
            .from("product_variants")
            .update({ unit_price: preis })
            .eq("id", staffeln[0].id as string)
        ).error
      : (
          await supabase.from("product_variants").insert({
            product_id: input.id,
            min_quantity: 1,
            max_quantity: null,
            unit_price: preis,
          })
        ).error;

    if (fehler) {
      console.error("[admin] Preis speichern:", fehler.message);
      return { error: "Der Preis konnte nicht gespeichert werden." };
    }
  } else if (feld === "cost_price") {
    /*
     * Der Einkaufspreis hängt nicht an products, sondern an der eigenen
     * Tabelle product_costs (Migration 047) – an products wäre er für jeden
     * angemeldeten Kunden lesbar. Leeres Feld heißt „nicht gepflegt", also
     * weg mit der Zeile und nicht 0 hineinschreiben: 0,00 € Einkauf gibt es
     * nicht, und an der Kasse stünde dann „Marge 100 %".
     */
    const preis = parsed.data as number | null;
    const { error } =
      preis === null
        ? await supabase.from("product_costs").delete().eq("product_id", input.id)
        : await supabase.from("product_costs").upsert(
            { product_id: input.id, cost_price: preis, updated_at: new Date().toISOString() },
            { onConflict: "product_id" },
          );

    if (error) {
      console.error("[admin] Einkaufspreis speichern:", error.message);
      return { error: "Der Einkaufspreis konnte nicht gespeichert werden." };
    }
  } else {
    const wert = feld === "barcode" ? (parsed.data as string) || null : parsed.data;

    const { error } = await supabase
      .from("products")
      .update({ [feld]: wert })
      .eq("id", input.id);

    if (error) {
      console.error("[admin] Feld speichern:", error.message);
      return {
        error:
          error.code === "23505"
            ? "Dieser Barcode ist bereits einem anderen Artikel zugeordnet."
            : "Die Änderung konnte nicht gespeichert werden.",
      };
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/admin/preisschilder");
  revalidatePath("/shop");
  revalidatePath(`/shop/product/${input.id}`);
  return { success: "Gespeichert." };
}
