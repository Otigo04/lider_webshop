import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { FREE_SHIPPING_THRESHOLD, freeShippingThreshold } from "@/lib/shipping";
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
  free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
  pos_vat_rate: 19,
  pos_prices_gross: true,
  pos_receipt_footer: null,
  pos_closing_from: null,
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
  const zusammen = {
    ...EMPTY_SETTINGS,
    ...(data as Partial<CompanySettings> | null),
  };

  // NUMERIC kommt über PostgREST als Zeichenkette an. Ungeprüft übernommen
  // würde aus dem Vergleich „Summe >= Grenze" ein Textvergleich.
  return {
    ...zusammen,
    free_shipping_threshold: freeShippingThreshold(
      zusammen.free_shipping_threshold,
    ),
  };
}

/** Kontaktangaben, die jeder Besucher sehen darf (Migration 036). */
export interface PublicContact {
  company_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /**
   * Versandkostenfreigrenze. Steht in der öffentlichen Auskunft, weil sie auf
   * Startseite und Versandseite geworben wird – die sehen auch Besucher ohne
   * Konto. Bankdaten und Steuernummern bleiben hinter der Policy.
   */
  free_shipping_threshold: number;
}

/**
 * Telefon, E-Mail und Anschrift für Fußzeile und Startseite – ohne Sitzung
 * und ohne Bankdaten. company_settings selbst bleibt nur für Angemeldete
 * lesbar; die Funktion public_company_contact() gibt genau diese Spalten frei.
 * Fehlt sie noch, bleibt alles null und die Aufrufer zeigen Platzhalter.
 */
export async function getPublicContact(): Promise<PublicContact> {
  const leer: PublicContact = {
    company_name: null,
    address_street: null,
    address_zip: null,
    address_city: null,
    phone: null,
    email: null,
    website: null,
    free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
  };
  const { data, error } = await createPublicClient().rpc("public_company_contact");
  if (error) {
    console.error("[einstellungen] Kontaktdaten:", error.message);
    return leer;
  }
  const zeile = (Array.isArray(data) ? data[0] : data) as Partial<PublicContact> | undefined;
  const zusammen = { ...leer, ...(zeile ?? {}) };
  return {
    ...zusammen,
    free_shipping_threshold: freeShippingThreshold(
      zusammen.free_shipping_threshold,
    ),
  };
}
