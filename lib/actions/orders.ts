"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateAndSendOrderInvoice } from "@/lib/actions/invoicing";
import { composeAddress } from "@/lib/address";

export interface CheckoutState {
  error?: string;
  orderId?: string;
  orderNumber?: string;
}

/**
 * Vom Client kommen nur Artikel-ID und Menge. Preise, Staffeln, Steuersatz und
 * Bestände zieht die Datenbankfunktion create_order selbst – siehe
 * supabase/migrations/029_bestellablauf.sql.
 */
const checkoutSchema = z
  .object({
    items: z
      .array(
        z.object({
          product_id: z.string().uuid(),
          quantity: z.number().int().positive().max(1_000_000),
        }),
      )
      .min(1, "Der Warenkorb ist leer."),
    deliveryMethod: z.enum(["pickup", "shipping"]).default("shipping"),
    paymentMethod: z.enum(["transfer", "cash", "card"]).default("transfer"),
    /** true = abweichende Anschrift im Formular, false = die hinterlegte */
    differentAddress: z.boolean().default(false),
    delivery_name: z.string().trim().max(160).optional(),
    delivery_street: z.string().trim().max(200).optional(),
    delivery_zip: z.string().trim().max(20).optional(),
    delivery_city: z.string().trim().max(120).optional(),
    delivery_country: z.string().trim().max(80).optional(),
    /** ISO-Zeitstempel, im Browser aus der lokalen Eingabe erzeugt */
    pickupAt: z.string().datetime().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) =>
      data.deliveryMethod !== "shipping" ||
      !data.differentAddress ||
      Boolean(data.delivery_street && data.delivery_zip && data.delivery_city),
    {
      message: "Bitte die abweichende Lieferadresse vollständig angeben.",
      path: ["delivery_street"],
    },
  )
  .refine(
    (data) => data.paymentMethod === "transfer" || data.deliveryMethod === "pickup",
    {
      message: "Bar- und Kartenzahlung gibt es nur bei Selbstabholung.",
      path: ["paymentMethod"],
    },
  );

export async function createOrder(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await requireUser("/checkout");

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Der Warenkorb konnte nicht gelesen werden." };
  }

  const parsed = checkoutSchema.safeParse({
    items: rawItems,
    deliveryMethod: formData.get("deliveryMethod") ?? "shipping",
    paymentMethod: formData.get("paymentMethod") ?? "transfer",
    differentAddress: formData.get("differentAddress") === "1",
    delivery_name: formData.get("delivery_name") ?? undefined,
    delivery_street: formData.get("delivery_street") ?? undefined,
    delivery_zip: formData.get("delivery_zip") ?? undefined,
    delivery_city: formData.get("delivery_city") ?? undefined,
    delivery_country: formData.get("delivery_country") ?? undefined,
    pickupAt: formData.get("pickupAt") || undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const eingabe = parsed.data;

  /*
   * Ohne abweichende Anschrift gilt die im Konto hinterlegte. Sie wird hier
   * aufgelöst und mitgeschickt, statt sie in der Datenbank nachzuschlagen:
   * so steht an der Bestellung die Adresse, die dem Kunden im Formular
   * angezeigt wurde – auch wenn er sein Konto danach ändert.
   */
  const anschrift = eingabe.differentAddress
    ? {
        name: eingabe.delivery_name || user.company_name || user.full_name || null,
        street: eingabe.delivery_street ?? null,
        zip: eingabe.delivery_zip ?? null,
        city: eingabe.delivery_city ?? null,
        country: eingabe.delivery_country || "Deutschland",
      }
    : {
        name: user.company_name || user.full_name || null,
        street: user.shipping_street,
        zip: user.shipping_zip,
        city: user.shipping_city,
        country: user.shipping_country || "Deutschland",
      };

  const versand = eingabe.deliveryMethod === "shipping";

  if (versand && !(anschrift.street && anschrift.zip && anschrift.city)) {
    return {
      error:
        "Für den Versand fehlt eine vollständige Lieferadresse. Bitte tragen Sie sie hier oder in Ihrem Konto ein.",
    };
  }

  // Freitextfassung für Anzeige und Altbestand – die Einzelfelder sind
  // maßgeblich, dieser Text ist die lesbare Zusammenfassung.
  const adresstext =
    versand && anschrift.street && anschrift.zip && anschrift.city
      ? [
          anschrift.name,
          composeAddress({
            street: anschrift.street,
            zip: anschrift.zip,
            city: anschrift.city,
            country: anschrift.country,
          }),
        ]
          .filter(Boolean)
          .join("\n")
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_items: eingabe.items,
    p_notes: eingabe.notes ?? null,
    p_delivery_address: adresstext,
    p_delivery_method: eingabe.deliveryMethod,
    p_payment_method: eingabe.paymentMethod,
    p_pickup_at: eingabe.deliveryMethod === "pickup" ? (eingabe.pickupAt ?? null) : null,
    p_delivery_name: versand ? anschrift.name : null,
    p_delivery_street: versand ? anschrift.street : null,
    p_delivery_zip: versand ? anschrift.zip : null,
    p_delivery_city: versand ? anschrift.city : null,
    p_delivery_country: versand ? anschrift.country : null,
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

  const created = data as { id: string; order_number: string };

  // Rechnung + Mailversand dürfen eine bereits angelegte Bestellung nie
  // scheitern lassen – Fehler landen nur im Log, der Kunde bekommt seine
  // Bestellbestätigung auf dem Bildschirm in jedem Fall.
  try {
    await generateAndSendOrderInvoice(created.id, user);
  } catch (err) {
    console.error("[bestellung] Rechnung/Mailversand fehlgeschlagen:", err);
  }

  return { orderId: created.id, orderNumber: created.order_number };
}
