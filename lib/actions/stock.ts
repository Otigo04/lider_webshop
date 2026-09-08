"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StockEntry } from "@/lib/types";

/**
 * Wareneingang buchen.
 *
 * Der Vorgang läuft vollständig in record_stock_entries() (Migration 030):
 * Bestand unter Zeilensperre lesen und schreiben, neue Artikel anlegen,
 * Journalzeilen setzen – alles in einer Transaktion. Eine Lieferung, die zur
 * Hälfte gebucht ist, wäre schlimmer als eine gar nicht gebuchte, weil
 * niemand wüsste, wo sie abbrach.
 */

/**
 * Ein leeres Preisfeld heißt "nicht anfassen", nicht "auf 0 setzen". Deshalb
 * wird der Leerstring zu null und nicht von z.coerce zur Zahl 0 gemacht.
 */
const preis = z.preprocess(
  (wert) => (wert === "" || wert === null || wert === undefined ? null : wert),
  z.coerce
    .number({ message: "Preis muss eine Zahl sein" })
    .min(0, "Preis darf nicht negativ sein")
    .max(1_000_000)
    .nullable(),
);

const itemSchema = z.object({
  /** null = neuer Artikel, dann sind Bezeichnung und Warengruppe Pflicht */
  productId: z.string().uuid().nullable(),
  name: z.string().trim().max(200),
  barcode: z.string().trim().max(64).nullable(),
  categoryId: z.string().uuid().nullable(),
  quantity: z.coerce
    .number({ message: "Menge muss eine Zahl sein" })
    .int("Menge muss eine ganze Zahl sein")
    .min(-10_000_000)
    .max(10_000_000)
    .refine((wert) => wert !== 0, "Menge 0 ist keine Buchung"),
  unitPrice: preis,
  retailPrice: preis,
});

const schema = z.object({
  items: z.array(itemSchema).min(1, "Es wurde nichts erfasst."),
  note: z.string().trim().max(500).nullable(),
});

export interface RecordStockResult {
  error?: string;
  entries?: StockEntry[];
}

export async function recordStockEntries(
  input: z.input<typeof schema>,
): Promise<RecordStockResult> {
  await requireAdmin();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const daten = parsed.data;

  // Neue Artikel brauchen eine Bezeichnung. Die Datenbank prüft das ebenfalls,
  // aber ihre Meldung käme erst nach dem Absenden der ganzen Lieferung.
  const ohneNamen = daten.items.find(
    (item) => item.productId === null && item.name === "",
  );
  if (ohneNamen) {
    return { error: "Ein neuer Artikel braucht eine Bezeichnung." };
  }
  const ohneGruppe = daten.items.find(
    (item) => item.productId === null && item.categoryId === null,
  );
  if (ohneGruppe) {
    return { error: `Für „${ohneGruppe.name}“ fehlt die Warengruppe.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_stock_entries", {
    p_items: daten.items.map((item) => ({
      product_id: item.productId,
      name: item.name,
      barcode: item.barcode,
      category_id: item.categoryId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      retail_price: item.retailPrice,
    })),
    p_note: daten.note,
  });

  if (error) {
    console.error("[wareneingang] Buchen:", error.message);
    // Meldungen der Datenbank durchreichen: „Der Barcode 4001 ist bereits
    // vergeben." ist genau das, was am Wareneingang gebraucht wird.
    return { error: error.message || "Der Wareneingang konnte nicht gebucht werden." };
  }

  revalidatePath("/admin/bestand");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/shop");

  return { entries: (data ?? []) as unknown as StockEntry[] };
}
