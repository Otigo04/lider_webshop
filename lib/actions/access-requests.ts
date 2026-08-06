"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface AccessRequestFormState {
  error?: string;
  success?: string;
}

const requestSchema = z
  .object({
    company_name: z.string().trim().min(1, "Firma fehlt").max(120),
    contact_name: z.string().trim().min(1, "Ansprechpartner fehlt").max(120),
    email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse"),
    phone: z.string().trim().max(50).optional(),
    billing_address: z.string().trim().min(1, "Rechnungsadresse fehlt").max(500),
    same_address: z.boolean(),
    shipping_address: z.string().trim().max(500).optional(),
    message: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => data.same_address || (data.shipping_address ?? "").length > 0,
    { message: "Versandadresse fehlt", path: ["shipping_address"] },
  );

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
  const parsed = requestSchema.safeParse({
    company_name: formData.get("company_name"),
    contact_name: formData.get("contact_name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    billing_address: formData.get("billing_address"),
    same_address: formData.get("same_address") === "on",
    shipping_address: formData.get("shipping_address") || undefined,
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    company_name: data.company_name,
    contact_name: data.contact_name,
    email: data.email,
    phone: data.phone || null,
    billing_address: data.billing_address,
    shipping_address: data.same_address
      ? data.billing_address
      : (data.shipping_address as string),
    message: data.message || null,
  });

  if (error) {
    console.error("[zugang] Anfrage speichern:", error.message);
    return { error: "Die Anfrage konnte nicht gesendet werden." };
  }

  return { success: "Anfrage eingegangen. Wir melden uns bei Ihnen." };
}
