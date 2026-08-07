"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface AccessRequestFormState {
  error?: string;
  success?: string;
}

const requestSchema = z.object({
  company_name: z.string().trim().min(1, "Firma fehlt").max(120),
  first_name: z.string().trim().min(1, "Vorname fehlt").max(120),
  last_name: z.string().trim().min(1, "Nachname fehlt").max(120),
  email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse"),
  phone: z.string().trim().max(50).optional(),
  billing_street: z.string().trim().min(1, "Straße fehlt").max(200),
  billing_zip: z.string().trim().min(1, "PLZ fehlt").max(20),
  billing_city: z.string().trim().min(1, "Ort fehlt").max(120),
  billing_country: z.string().trim().min(1, "Land fehlt").max(80),
  different_shipping: z.boolean(),
  shipping_street: z.string().trim().max(200).optional(),
  shipping_zip: z.string().trim().max(20).optional(),
  shipping_city: z.string().trim().max(120).optional(),
  shipping_country: z.string().trim().max(80).optional(),
  message: z.string().trim().max(2000).optional(),
});

/**
 * Speichert die Anfrage nur – kein E-Mail-Versand (kein SMTP-Anbieter im
 * Projekt hinterlegt, siehe lib/actions/admin-customers.ts). Der Admin sieht
 * neue Anfragen unter /admin/zugangsanfragen und legt den Kunden dort manuell
 * an, genau wie jede andere Kundenanlage im Projekt auch.
 */
export async function submitAccessRequest(
  _prevState: AccessRequestFormState,
  formData: FormData,
): Promise<AccessRequestFormState> {
  // Lockvogelfeld: für Menschen unsichtbar, Formularroboter füllen es aus.
  // Kommentarlos als Erfolg quittieren – wer automatisiert sendet, soll nicht
  // erfahren, woran es gescheitert ist.
  if (formData.get("website")) {
    return { success: "Anfrage eingegangen. Wir melden uns bei Ihnen." };
  }

  const parsed = requestSchema.safeParse({
    company_name: formData.get("company_name"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    billing_street: formData.get("billing_street"),
    billing_zip: formData.get("billing_zip"),
    billing_city: formData.get("billing_city"),
    billing_country: formData.get("billing_country"),
    different_shipping: formData.get("different_shipping") === "on",
    shipping_street: formData.get("shipping_street") || undefined,
    shipping_zip: formData.get("shipping_zip") || undefined,
    shipping_city: formData.get("shipping_city") || undefined,
    shipping_country: formData.get("shipping_country") || undefined,
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;

  if (
    data.different_shipping &&
    (!data.shipping_street || !data.shipping_zip || !data.shipping_city)
  ) {
    return { error: "Versandadresse ist unvollständig." };
  }

  const useShipping = data.different_shipping;
  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    company_name: data.company_name,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone || null,
    billing_street: data.billing_street,
    billing_zip: data.billing_zip,
    billing_city: data.billing_city,
    billing_country: data.billing_country,
    shipping_street: useShipping ? data.shipping_street : data.billing_street,
    shipping_zip: useShipping ? data.shipping_zip : data.billing_zip,
    shipping_city: useShipping ? data.shipping_city : data.billing_city,
    shipping_country: useShipping ? data.shipping_country : data.billing_country,
    message: data.message || null,
  });

  if (error) {
    // Die Bremse aus Migration 014 meldet sich als check_violation und trägt
    // einen Text, den der Besucher lesen darf.
    if (error.code === "23514" || error.message.includes("Anfrage")) {
      return { error: error.message.replace(/^.*?:\s*/, "") };
    }
    console.error("[zugang] Anfrage speichern:", error.message);
    return { error: "Die Anfrage konnte nicht gesendet werden." };
  }

  return { success: "Anfrage eingegangen. Wir melden uns bei Ihnen." };
}
