import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { FREE_SHIPPING_THRESHOLD, freeShippingThreshold } from "@/lib/shipping";
import {
  IMPRESSUM_VORLAGE,
  leseImpressum,
  type ImpressumAbschnitt,
  type ImpressumDaten,
} from "@/lib/impressum";
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
  register_court: null,
  register_number: null,
  impressum: null,
  bank_name: null,
  iban: null,
  bic: null,
  payment_terms_days: 14,
  free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
  pos_vat_rate: 19,
  pos_prices_gross: true,
  pos_receipt_footer: null,
  pos_closing_from: null,
  maintenance_mode: false,
  maintenance_title: null,
  maintenance_message: null,
  maintenance_until: null,
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

/** Kontaktangaben, die jeder Besucher sehen darf (Migration 036, 042). */
export interface PublicContact {
  company_name: string | null;
  /** Vertretungsberechtigte(r) – Pflichtangabe im Impressum (§ 5 DDG). */
  owner_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** USt-IdNr. nach § 27 a UStG – anders als die Steuernummer öffentlich. */
  vat_id: string | null;
  /**
   * Versandkostenfreigrenze. Steht in der öffentlichen Auskunft, weil sie auf
   * Startseite und Versandseite geworben wird – die sehen auch Besucher ohne
   * Konto. Bankdaten und Steuernummern bleiben hinter der Policy.
   */
  free_shipping_threshold: number;
}

/**
 * Telefon, E-Mail, Anschrift, Vertretung und USt-IdNr. für Fußzeile,
 * Startseite, Impressum und Datenschutzerklärung – ohne Sitzung und ohne
 * Bankdaten. company_settings selbst bleibt nur für Angemeldete lesbar; die
 * Funktion public_company_contact() gibt genau diese Spalten frei. Fehlt sie
 * noch, bleibt alles null und die Aufrufer zeigen Platzhalter.
 */
export async function getPublicContact(): Promise<PublicContact> {
  const leer: PublicContact = {
    company_name: null,
    owner_name: null,
    address_street: null,
    address_zip: null,
    address_city: null,
    phone: null,
    email: null,
    website: null,
    vat_id: null,
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

/** Wartungsschalter samt Titel, Text und Datum für anonyme Besucher (Migration 043, 044). */
export interface MaintenanceInfo {
  enabled: boolean;
  /** Eigene Überschrift aus /admin/settings. null = /wartung zeigt den Standardtitel. */
  title: string | null;
  /** Eigener Text aus /admin/settings. null = /wartung zeigt den Standardtext. */
  message: string | null;
  /** "Voraussichtlich verfügbar ab". null = keine Angabe. */
  until: string | null;
}

/**
 * Ohne Sitzung gelesen (proxy.ts entscheidet über die Umleitung, /wartung
 * zeigt Titel, Text und Datum). Fehlt die Funktion (Migration 043/044 noch
 * nicht eingespielt), bleibt der Schalter aus – fail open, siehe proxy.ts.
 */
export async function getMaintenanceInfo(): Promise<MaintenanceInfo> {
  const leer: MaintenanceInfo = {
    enabled: false,
    title: null,
    message: null,
    until: null,
  };
  const { data, error } = await createPublicClient().rpc(
    "public_maintenance_status",
  );
  if (error) {
    console.error("[einstellungen] Wartungsmodus:", error.message);
    return leer;
  }
  const zeile = (Array.isArray(data) ? data[0] : data) as
    | Partial<MaintenanceInfo>
    | undefined;
  return { ...leer, ...(zeile ?? {}), enabled: zeile?.enabled === true };
}

export interface PublicImpressum {
  abschnitte: ImpressumAbschnitt[];
  daten: ImpressumDaten;
}

/**
 * Impressum für jeden Besucher (Migration 045). Wie die Kontaktangaben über
 * eine eigene Funktion, weil company_settings auch Bankdaten trägt. Fehlt
 * die Funktion noch, zeigt die Seite die Vorlage mit den Kontaktangaben aus
 * Migration 036 – ein Impressum darf nicht ausfallen.
 */
export async function getPublicImpressum(): Promise<PublicImpressum> {
  const { data, error } = await createPublicClient().rpc("public_impressum");
  const zeile = (Array.isArray(data) ? data[0] : data) as
    | (Partial<ImpressumDaten> & { impressum?: unknown })
    | undefined;

  if (error || !zeile) {
    if (error) console.error("[einstellungen] Impressum:", error.message);
    const kontakt = await getPublicContact();
    return {
      abschnitte: IMPRESSUM_VORLAGE,
      daten: {
        ...kontakt,
        address_country: null,
        register_court: null,
        register_number: null,
      },
    };
  }

  return {
    abschnitte: leseImpressum(zeile.impressum) ?? IMPRESSUM_VORLAGE,
    daten: {
      company_name: zeile.company_name ?? null,
      owner_name: zeile.owner_name ?? null,
      address_street: zeile.address_street ?? null,
      address_zip: zeile.address_zip ?? null,
      address_city: zeile.address_city ?? null,
      address_country: zeile.address_country ?? null,
      phone: zeile.phone ?? null,
      email: zeile.email ?? null,
      website: zeile.website ?? null,
      vat_id: zeile.vat_id ?? null,
      register_court: zeile.register_court ?? null,
      register_number: zeile.register_number ?? null,
    },
  };
}
