"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateAndSendOrderInvoice } from "@/lib/actions/invoicing";
import { erzeugeStornoRechnung } from "@/lib/storno-erzeugen";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import {
  isZahlungsvermerkKey,
  zahlungsvermerkText,
} from "@/lib/zahlungsvermerk";
import type { AppUser } from "@/lib/types";

/** Zahlungsvermerk aus Auswahl und Freitext des Formulars (null = Standard). */
function zahlungsvermerkAusForm(formData: FormData): string | null {
  const key = formData.get("payment_key");
  if (!isZahlungsvermerkKey(key)) return null;
  const frei = String(formData.get("payment_free") ?? "").slice(0, 500);
  return zahlungsvermerkText(key, frei);
}

export interface InvoiceActionState {
  error?: string;
  orderId?: string;
  invoiceId?: string;
  /** Was angelegt wurde: Rechnung oder Lieferschein */
  beleg?: "rechnung" | "lieferschein";
  /** Beim Ändern: Nummer der Rechnung, die storniert und ersetzt wurde */
  ersetzt?: string;
  /** Etwas Nebensächliches, das nicht geklappt hat – die Änderung gilt trotzdem */
  hinweis?: string;
}

/** Katalogartikel: Preis aus der Staffel, es sei denn, `unit_price` überschreibt ihn. */
const catalogItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(1_000_000),
  // Überschreibt die Staffel-Auflösung, wenn gesetzt – siehe create_admin_order
  // in supabase/migrations/079_rechnung_freie_positionen.sql.
  unit_price: z.number().min(0).max(1_000_000).optional(),
});

/** Freie Position (Migration 079): kein Artikel, Beschreibung und Preis vom Admin. */
const freeItemSchema = z.object({
  description: z.string().trim().min(1, "Beschreibung fehlt.").max(500),
  quantity: z.number().int("Die Menge muss eine ganze Zahl sein.").positive().max(1_000_000),
  unit_price: z.number().min(0).max(1_000_000),
  /** Gescannter oder getippter Strichcode; leer = keiner */
  barcode: z
    .string()
    .trim()
    .max(64, "Barcode ist zu lang (höchstens 64 Zeichen).")
    .optional()
    .transform((wert) => wert || undefined),
});

/**
 * Positionen einzeln prüfen: Katalog oder frei, je nachdem, ob `product_id`
 * dabeisteht. Eine Union meldete bei einem Fehler nur „ungültig", hier steht
 * die Meldung der Position, die gemeint ist („Beschreibung fehlt.").
 */
const itemSchema = z.unknown().transform((wert, ctx) => {
  const katalog =
    typeof wert === "object" && wert !== null && "product_id" in wert && wert.product_id;
  const ergebnis = (katalog ? catalogItemSchema : freeItemSchema).safeParse(wert);
  if (ergebnis.success) return ergebnis.data;
  ctx.addIssue({ code: "custom", message: ergebnis.error.issues[0].message });
  return z.NEVER;
});

const optionalText = (max: number, meldung: string) =>
  z
    .string()
    .trim()
    .max(max, meldung)
    .optional()
    .transform((wert) => wert || undefined);

const catalogSchema = z
  .object({
    /** Rechnung oder Lieferschein: der Lieferschein trägt keine Preise */
    beleg: z.enum(["rechnung", "lieferschein"]).default("rechnung"),
    /** Kunde mit Konto oder nur mit Namen (Migration 080) */
    kunde_art: z.enum(["konto", "frei"]).default("konto"),
    customer_id: z.string().uuid("Kein Kunde ausgewählt.").optional(),
    customer_label: optionalText(120, "Der Name ist zu lang (höchstens 120 Zeichen)."),
    customer_street: optionalText(120, "Die Straße ist zu lang."),
    customer_zip: optionalText(12, "Die PLZ ist zu lang."),
    customer_city: optionalText(80, "Der Ort ist zu lang."),
    items: z.array(itemSchema).min(1, "Mindestens eine Position angeben."),
    notes: z.string().trim().max(2000).optional(),
    delivery_address: z.string().trim().max(500).optional(),
    delivery_method: z.enum(["pickup", "shipping"]).default("pickup"),
    /** Sonderkondition anwenden (Migration 056), Vorgabe ja */
    apply_condition: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.kunde_art === "konto" && !d.customer_id) {
      ctx.addIssue({ code: "custom", message: "Kein Kunde ausgewählt.", path: ["customer_id"] });
    }
    if (d.kunde_art === "frei" && !d.customer_label) {
      ctx.addIssue({ code: "custom", message: "Bitte den Namen des Kunden angeben.", path: ["customer_label"] });
    }
  });

type BelegDaten = z.infer<typeof catalogSchema>;

/** Formularfelder lesen und prüfen – für Anlegen und Ändern dieselbe Stelle. */
function belegAusFormular(formData: FormData): { error: string } | { d: BelegDaten } {
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Die Positionen konnten nicht gelesen werden." };
  }

  const parsed = catalogSchema.safeParse({
    beleg: formData.get("beleg") || "rechnung",
    kunde_art: formData.get("kunde_art") || "konto",
    customer_id: formData.get("customer_id") || undefined,
    customer_label: formData.get("customer_label") || undefined,
    customer_street: formData.get("customer_street") || undefined,
    customer_zip: formData.get("customer_zip") || undefined,
    customer_city: formData.get("customer_city") || undefined,
    items: rawItems,
    notes: formData.get("notes") || undefined,
    delivery_address: formData.get("delivery_address") || undefined,
    delivery_method: formData.get("delivery_method") || "pickup",
    apply_condition: formData.get("apply_condition") !== "0",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return { d: parsed.data };
}

/**
 * Parameter für create_admin_order / update_admin_order. Die Angaben ohne
 * Konto gehen nur mit, wenn es sie gibt: so läuft ein Aufruf für ein Konto auch,
 * solange Migration 080 noch fehlt.
 */
function belegParameter(d: BelegDaten) {
  const ohneKonto = d.kunde_art === "frei";
  return {
    p_items: d.items,
    p_notes: d.notes ?? null,
    p_delivery_address: d.delivery_address ?? null,
    p_delivery_method: d.delivery_method,
    // Ohne Konto gibt es keine Sonderkondition; beim Lieferschein ohne Preise
    // schickt das Formular „0" (es gibt keine Beträge, die sie senken könnte).
    p_apply_condition: !ohneKonto && d.apply_condition,
    ...(ohneKonto
      ? {
          p_customer_label: d.customer_label ?? null,
          p_customer_street: d.customer_street ?? null,
          p_customer_zip: d.customer_zip ?? null,
          p_customer_city: d.customer_city ?? null,
        }
      : {}),
  };
}

/**
 * Bestellung anlegen und, bei einer Rechnung, die Rechnung stellen und
 * verschicken. Gemeinsam für „Neue Rechnung" und das Ersetzen einer
 * Rechnung beim Bearbeiten.
 */
async function legeBelegAn(
  d: BelegDaten,
  formData: FormData,
): Promise<{ error: string } | { orderId: string; beleg: "rechnung" | "lieferschein" }> {
  const ohneKonto = d.kunde_art === "frei";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_admin_order", {
    p_customer_id: ohneKonto ? null : d.customer_id,
    ...belegParameter(d),
  });

  if (error || !data) {
    console.error("[admin] create_admin_order:", error?.message);
    return { error: error?.message || "Die Bestellung konnte nicht angelegt werden." };
  }

  const order = data as { id: string; order_number: string };

  // Lieferschein: es bleibt bei der Bestellung, die Rechnung lässt sich später
  // aus ihr erzeugen. Der Lieferschein hat keine eigene Nummer, es gilt die
  // Bestellnummer (docs/kasse.md).
  if (d.beleg === "lieferschein") {
    revalidatePath("/admin/orders");
    return { orderId: order.id, beleg: "lieferschein" };
  }

  let customer: AppUser | null = null;
  if (!ohneKonto) {
    const { data: customerRow, error: customerError } = await supabase
      .from("users")
      .select("*")
      .eq("id", d.customer_id!)
      .single();
    if (customerError || !customerRow) {
      console.error("[admin] Kunde laden:", customerError?.message);
      revalidatePath("/admin/orders");
      return { orderId: order.id, beleg: "rechnung" };
    }
    customer = customerRow as AppUser;
  }

  try {
    await generateAndSendOrderInvoice(order.id, customer, {
      paymentNote: zahlungsvermerkAusForm(formData),
    });
  } catch (err) {
    console.error("[admin] Rechnung/Mailversand fehlgeschlagen:", err);
  }

  revalidatePath("/admin/orders");
  revalidatePath("/kasse/rechnungen");
  return { orderId: order.id, beleg: "rechnung" };
}

/**
 * Admin legt einen Beleg für einen Kunden an: Bestellung plus Rechnung oder,
 * als Lieferschein, Bestellung ohne Rechnung. Katalogartikel und freie
 * Positionen in einer Liste; der Kunde hat ein Konto oder steht nur mit Namen
 * da (Migration 080). Läuft danach in dieselbe Rechnungs-Pipeline wie der
 * normale Checkout.
 */
export async function createInvoiceOrder(
  _prevState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  await requireAdmin();
  const gelesen = belegAusFormular(formData);
  if ("error" in gelesen) return { error: gelesen.error };
  return legeBelegAn(gelesen.d, formData);
}

/**
 * Beleg ändern (Migration 081).
 *
 * - **Lieferschein** (Bestellung ohne Rechnung): wird an Ort und Stelle
 *   geändert, die Nummer bleibt, der Bestand bucht die Differenz.
 * - **Rechnung**: wird nie überschrieben. Die geänderte Fassung entsteht als
 *   neue Bestellung mit neuer Rechnung; erst danach wird die alte storniert
 *   (Stornorechnung wie gewohnt) und ihr Bestand zurückgebucht – netto bleibt die
 *   Differenz. So scheitert nichts Halbes: ein Fehler in den Angaben fällt
 *   auf, bevor irgendetwas storniert ist.
 */
export async function updateInvoiceOrder(
  _prevState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  await requireAdmin();

  const orderId = String(formData.get("order_id") ?? "");
  if (!z.string().uuid().safeParse(orderId).success) {
    return { error: "Keine Bestellung ausgewählt." };
  }
  const gelesen = belegAusFormular(formData);
  if ("error" in gelesen) return { error: gelesen.error };
  const d = gelesen.d;

  const supabase = await createClient();
  const { data: alt, error: altFehler } = await supabase
    .from("orders")
    .select("id, status, order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (altFehler || !alt) {
    console.error("[admin] Bestellung zum Ändern laden:", altFehler?.message);
    return { error: "Die Bestellung konnte nicht geladen werden." };
  }
  if (alt.status === "cancelled") {
    return { error: "Die Bestellung ist storniert und lässt sich nicht ändern." };
  }

  const { data: rechnung } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .maybeSingle();

  // --- Lieferschein: an Ort und Stelle -------------------------------------
  if (!rechnung) {
    const { error } = await supabase.rpc("update_admin_order", {
      p_order_id: orderId,
      ...belegParameter(d),
    });
    if (error) {
      console.error("[admin] update_admin_order:", error.message);
      return { error: error.message || "Der Lieferschein konnte nicht geändert werden." };
    }
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    return { orderId, beleg: "lieferschein" };
  }

  // --- Rechnung: neu stellen, alte stornieren --------------------------------
  const neu = await legeBelegAn({ ...d, beleg: "rechnung" }, formData);
  if ("error" in neu) return { error: neu.error };

  const { data: neueRechnung } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("order_id", neu.orderId)
    .maybeSingle();
  const neueNummer = neueRechnung?.invoice_number ?? "die neue Rechnung";

  const { error: stornoFehler } = await supabase.rpc("cancel_invoice", {
    p_invoice_id: rechnung.id,
    p_reason: `Geändert, ersetzt durch Rechnung ${neueNummer}`,
  });
  if (stornoFehler) {
    console.error("[admin] Storno beim Ändern:", stornoFehler.message);
    revalidatePath("/admin/orders");
    revalidatePath("/kasse/rechnungen");
    return {
      error: `Die neue Rechnung ${neueNummer} ist angelegt, die alte (${rechnung.invoice_number}) ließ sich aber nicht stornieren: ${stornoFehler.message} Bitte die alte Rechnung auf ihrer Bestellseite von Hand stornieren.`,
    };
  }

  // Stornorechnung (PDF, auf Wunsch Mail an Kunden mit Konto) und Bestand der
  // alten Bestellung zurück. Beides darf die Änderung nicht mehr kippen.
  const hinweise: string[] = [];
  const pdf = await erzeugeStornoRechnung(rechnung.id, { mail: d.kunde_art === "konto" });
  if (!pdf.ok) hinweise.push(`Das PDF der Stornorechnung fehlt noch: ${pdf.error}`);
  const { error: bestandFehler } = await supabase.rpc("restore_order_stock", {
    p_order_id: orderId,
  });
  if (bestandFehler) {
    console.error("[admin] Bestand zurückbuchen:", bestandFehler.message);
    hinweise.push("Der Bestand der alten Bestellung konnte nicht zurückgebucht werden.");
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/kasse/rechnungen");
  return {
    orderId: neu.orderId,
    beleg: "rechnung",
    ersetzt: rechnung.invoice_number,
    ...(hinweise.length > 0 ? { hinweis: hinweise.join(" ") } : {}),
  };
}

/**
 * Rechnung zu einer bestehenden Bestellung nachträglich erzeugen.
 *
 * Nötig für Bestellungen, bei denen die Rechnung beim Anlegen scheiterte –
 * etwa unter dem Fehler, den Migration 024 behebt. Die DB-Funktion gibt eine
 * bereits vorhandene Rechnung unverändert zurück, ein zweiter Klick legt also
 * keine zweite Nummer an.
 */
export async function createOrderInvoice(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  if (!z.string().uuid().safeParse(orderId).success) {
    return { error: "Keine Bestellung ausgewählt." };
  }

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("customer:users (*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    console.error("[admin] Bestellung für Rechnung laden:", error?.message);
    return { error: "Die Bestellung konnte nicht geladen werden." };
  }

  try {
    // Bestellbestätigung nicht erneut verschicken – die Bestellung ist alt.
    // Ohne Konto (Migration 080) ist `customer` null: die Rechnung wird
    // gestellt und abgelegt, aber nicht verschickt.
    await generateAndSendOrderInvoice(orderId, (order.customer as unknown as AppUser | null) ?? null, {
      sendOrderConfirmation: false,
    });
  } catch (err) {
    console.error("[admin] Rechnung nacherzeugen:", err);
    return { error: "Die Rechnung konnte nicht erzeugt werden." };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/kasse/rechnungen");
  return { success: "Rechnung erzeugt und verschickt." };
}
