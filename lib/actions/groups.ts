"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import type { ProductGroup } from "@/lib/types";

/**
 * Artikelgruppen (Migration 033).
 *
 * Das Anlegen der Ausführungen läuft vollständig in create_group_products():
 * jede braucht eine Artikelnummer aus dem Nummernkreis, eine Preisstaffel und
 * ihre Merkmalsverknüpfungen. Bricht das mittendrin ab, stünden halbe
 * Ausführungen im Sortiment und der Nummernkreis wäre schon weitergezählt –
 * deshalb eine Transaktion in der Datenbank und keine Schleife hier.
 */

const itemSchema = z.object({
  name: z.string().trim().min(1, "Eine Ausführung braucht eine Bezeichnung").max(200),
  barcode: z.string().trim().max(64).nullable(),
  valueIds: z.array(z.string().uuid()).max(20),
  unitPrice: z.coerce
    .number({ message: "Großhandelspreis muss eine Zahl sein" })
    .min(0, "Großhandelspreis darf nicht negativ sein")
    .max(1_000_000),
  retailPrice: z.preprocess(
    (wert) => (wert === "" || wert === null || wert === undefined ? null : wert),
    z.coerce
      .number({ message: "Ladenpreis muss eine Zahl sein" })
      .min(0)
      .max(1_000_000)
      .nullable(),
  ),
  listPrice: z.preprocess(
    (wert) => (wert === "" || wert === null || wert === undefined ? null : wert),
    z.coerce
      .number({ message: "Vorher-Preis muss eine Zahl sein" })
      .min(0)
      .max(1_000_000)
      .nullable(),
  ),
  stock: z.coerce
    .number({ message: "Bestand muss eine Zahl sein" })
    .int("Bestand muss eine ganze Zahl sein")
    .min(0, "Bestand darf nicht negativ sein")
    .max(10_000_000),
});

const createSchema = z.object({
  /** null = neue Gruppe, sonst Ausführungen einer bestehenden nachlegen */
  groupId: z.string().uuid().nullable(),
  name: z.string().trim().max(200),
  description: z.string().trim().max(5000),
  categoryId: z.string().uuid("Die Warengruppe fehlt"),
  items: z.array(itemSchema).min(1, "Es wurde keine Ausführung angegeben."),
});

export interface CreateGroupResult {
  error?: string;
  group?: ProductGroup;
}

/**
 * Kombinationen anlegen.
 *
 * Doppelte Barcodes fallen schon hier auf: die Datenbank prüft jede Zeile
 * gegen den Bestand, aber zwei gleiche Codes *innerhalb* der Eingabe würden
 * erst beim Einfügen der zweiten Zeile auffliegen – nach der ersten Meldung
 * stünde dann nichts, und niemand wüsste, welche der beiden gemeint war.
 */
export async function createGroupProducts(
  input: z.input<typeof createSchema>,
): Promise<CreateGroupResult> {
  await requireAdmin();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const daten = parsed.data;

  if (daten.groupId === null && daten.name === "") {
    return { error: "Die Gruppe braucht einen Namen." };
  }

  const codes = daten.items
    .map((item) => item.barcode?.trim())
    .filter((code): code is string => Boolean(code));
  if (new Set(codes).size !== codes.length) {
    return { error: "Zwei Ausführungen haben denselben Barcode." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group_products", {
    p_group_id: daten.groupId,
    p_name: daten.name || null,
    p_description: daten.description || null,
    p_category_id: daten.categoryId,
    p_items: daten.items.map((item) => ({
      name: item.name,
      barcode: item.barcode,
      value_ids: item.valueIds,
      unit_price: item.unitPrice,
      retail_price: item.retailPrice,
      list_price: item.listPrice,
      stock: item.stock,
    })),
  });

  if (error || !data) {
    console.error("[admin] Ausführungen anlegen:", error?.message);
    // Meldungen der Datenbank durchreichen: „Der Barcode 4001 ist bereits
    // vergeben." ist genau das, was hier gebraucht wird.
    return {
      error: error?.message ?? "Die Ausführungen konnten nicht angelegt werden.",
    };
  }

  gruppenNeuLaden();
  return { group: data as unknown as ProductGroup };
}

// --- Pflege der Gruppe --------------------------------------------------------

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Der Name fehlt").max(200),
  description: z.string().trim().max(5000),
});

export async function updateProductGroup(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_groups")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] Gruppe speichern:", error.message);
    return { error: "Die Gruppe konnte nicht gespeichert werden." };
  }

  gruppenNeuLaden();
  return { success: "Gruppe gespeichert." };
}

/**
 * Gruppe auflösen.
 *
 * Die Artikel bleiben und stehen danach wieder einzeln im Sortiment
 * (ON DELETE SET NULL). Nur die Klammer verschwindet – Bestände,
 * Bestellhistorie und Belege hängen an den Artikeln und nicht an ihr.
 */
export async function deleteProductGroup(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Keine Gruppe ausgewählt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("product_groups").delete().eq("id", id);

  if (error) {
    console.error("[admin] Gruppe auflösen:", error.message);
    return { error: "Die Gruppe konnte nicht aufgelöst werden." };
  }

  gruppenNeuLaden();
  return { success: "Gruppe aufgelöst. Die Artikel sind erhalten geblieben." };
}

const zuordnungSchema = z.object({
  productId: z.string().uuid(),
  /** null = aus der Gruppe lösen */
  groupId: z.string().uuid().nullable(),
});

/**
 * Einen bestehenden Artikel einer Gruppe zuordnen oder herauslösen.
 *
 * Der zweite Weg neben dem Generator: Ware, die schon im Regal steht, war
 * beim Anlegen noch kein Bündel. Welche Merkmale sie trägt, wird weiterhin am
 * Artikel selbst gepflegt – ohne sie stünde die Ausführung im Auswahlfeld
 * nirgends.
 */
export async function setProductGroup(
  input: z.input<typeof zuordnungSchema>,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = zuordnungSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Ungültige Zuordnung." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ group_id: parsed.data.groupId })
    .eq("id", parsed.data.productId);

  if (error) {
    console.error("[admin] Gruppenzuordnung:", error.message);
    return { error: "Die Zuordnung konnte nicht gespeichert werden." };
  }

  gruppenNeuLaden();
  revalidatePath(`/shop/product/${parsed.data.productId}`);
  return { success: "Gespeichert." };
}

function gruppenNeuLaden() {
  revalidatePath("/admin/gruppen");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
}
