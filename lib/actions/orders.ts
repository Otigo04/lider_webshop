"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface CheckoutState {
  error?: string;
  orderNumber?: string;
}

/**
 * Vom Client kommen nur Artikel-ID und Menge. Preise, Staffeln und Bestände
 * zieht die Datenbankfunktion create_order selbst – siehe
 * supabase/migrations/002_bestellung_anlegen.sql.
 */
const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive().max(1_000_000),
      }),
    )
    .min(1, "Der Warenkorb ist leer."),
  deliveryAddress: z.string().trim().max(500).optional(),
  deliveryMethod: z.enum(["pickup", "shipping"]).default("shipping"),
  notes: z.string().trim().max(2000).optional(),
});

export async function createOrder(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  await requireUser("/checkout");

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Der Warenkorb konnte nicht gelesen werden." };
  }

  const parsed = checkoutSchema.safeParse({
    items: rawItems,
    deliveryAddress: formData.get("deliveryAddress") ?? undefined,
    deliveryMethod: formData.get("deliveryMethod") ?? "shipping",
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_items: parsed.data.items,
    p_notes: parsed.data.notes ?? null,
    // Bei Abholung wird keine Adresse gespeichert, auch wenn das Feld
    // vorher ausgefüllt und dann umgeschaltet wurde.
    p_delivery_address:
      parsed.data.deliveryMethod === "pickup"
        ? null
        : (parsed.data.deliveryAddress ?? null),
    p_delivery_method: parsed.data.deliveryMethod,
  });

  if (error) {
    console.error("[bestellung] create_order:", error.message);
    // Die RAISE-EXCEPTION-Texte aus der Funktion sind bewusst kundentauglich
    // formuliert ("Von X sind nur noch 3 Stück verfügbar.") und werden direkt
    // durchgereicht. Bei allem anderen bleibt es bei einer neutralen Meldung.
    return {
      error:
        error.message ||
        "Die Bestellung konnte nicht angelegt werden. Bitte erneut versuchen.",
    };
  }

  revalidatePath("/orders");
  revalidatePath("/shop");

  return { orderNumber: (data as { order_number: string }).order_number };
}
