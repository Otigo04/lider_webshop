import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CompanySettings } from "@/lib/types";

const EMPTY_SETTINGS: CompanySettings = {
  company_name: null,
  owner_name: null,
  address_street: null,
  address_zip: null,
  address_city: null,
  address_country: "Deutschland",
  phone: null,
  email: null,
  website: null,
  tax_number: null,
  vat_id: null,
  bank_name: null,
  iban: null,
  bic: null,
  payment_terms_days: 14,
  pos_vat_rate: 19,
  pos_prices_gross: true,
  pos_receipt_footer: null,
};

/**
 * Firmendaten für den Rechnungskopf. Singleton-Zeile (id = true), angelegt
 * per Migration 016 – existiert also immer, außer die Migration wurde noch
 * nicht ausgeführt. In dem Fall greift der leere Fallback statt eines Fehlers,
 * damit Bestellungen weiter funktionieren, auch wenn der Admin die Seite
 * /admin/settings noch nicht ausgefüllt hat.
 */
export async function getCompanySettings(): Promise<CompanySettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error("[einstellungen] Firmendaten:", error.message);
    return EMPTY_SETTINGS;
  }
  // Über die Vorgaben legen statt ersetzen: Spalten, die eine noch nicht
  // eingespielte Migration mitbringt (etwa die Kassenfelder aus 018), fehlen
  // sonst schlicht und die Kasse rechnete mit undefined.
  return { ...EMPTY_SETTINGS, ...(data as Partial<CompanySettings> | null) };
}
