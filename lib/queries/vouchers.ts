import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, CustomerCondition, Order, Voucher } from "@/lib/types";

/**
 * Gutscheine und Sonderkonditionen (Migration 054). Beide Tabellen sind per
 * RLS nur für den Admin lesbar; der Kunde kommt an seinen Satz über
 * meine_kondition() und an einen Gutschein über gutschein_abfragen().
 */

export interface VoucherRow extends Voucher {
  einloesungen: number;
  kunde: Pick<AppUser, "id" | "company_name" | "full_name" | "customer_number"> | null;
}

export type VoucherStatus = "aktiv" | "geplant" | "abgelaufen" | "aufgebraucht" | "inaktiv";

/** Ein Wort für die Statusspalte – die Reihenfolge der Prüfung ist die Antwort. */
export function voucherStatus(v: VoucherRow, jetzt = Date.now()): VoucherStatus {
  if (!v.is_active) return "inaktiv";
  if (v.valid_until && new Date(v.valid_until).getTime() <= jetzt) return "abgelaufen";
  if (v.max_redemptions != null && v.einloesungen >= v.max_redemptions) return "aufgebraucht";
  if (v.valid_from && new Date(v.valid_from).getTime() > jetzt) return "geplant";
  return "aktiv";
}

export async function getVouchers(options?: { customerId?: string }): Promise<VoucherRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("vouchers")
    .select(
      `*, einloesungen:orders (count),
       kunde:users!vouchers_customer_id_fkey (id, company_name, full_name, customer_number)`,
    )
    .order("created_at", { ascending: false });

  if (options?.customerId) query = query.eq("customer_id", options.customerId);

  const { data, error } = await query;
  if (error) {
    console.error("[gutscheine] Liste:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as unknown as Voucher & {
      einloesungen: { count: number }[] | null;
      kunde: VoucherRow["kunde"];
    };
    return { ...r, einloesungen: r.einloesungen?.[0]?.count ?? 0 };
  });
}

export interface Einloesung {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  voucher_discount_amount: number;
  customer: Pick<AppUser, "id" | "company_name" | "full_name" | "customer_number"> | null;
}

export async function getVoucherRedemptions(voucherId: string): Promise<Einloesung[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, created_at, total_amount, voucher_discount_amount,
       customer:users (id, company_name, full_name, customer_number)`,
    )
    .eq("voucher_id", voucherId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[gutscheine] Einlösungen:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Einloesung[];
}

/** Alle Sonderkonditionen als Map – für die Kundenliste. */
export async function getConditions(): Promise<Map<string, CustomerCondition>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_conditions")
    .select("customer_id, discount_percent, note");

  if (error) {
    console.error("[konditionen] Liste:", error.message);
    return new Map();
  }
  return new Map(
    (data ?? []).map((row) => [row.customer_id as string, row as CustomerCondition]),
  );
}

export interface KundenUmsatz {
  bestellungen: number;
  umsatzNetto: number;
  letzteBestellung: string | null;
}

/** Bestellanzahl und Nettoumsatz je Kunde – eine Abfrage für die ganze Liste. */
export async function getUmsatzJeKunde(): Promise<Map<string, KundenUmsatz>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, total_amount, created_at");

  const map = new Map<string, KundenUmsatz>();
  if (error) {
    console.error("[kunden] Umsatz:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const id = row.customer_id as string;
    const eintrag = map.get(id) ?? { bestellungen: 0, umsatzNetto: 0, letzteBestellung: null };
    eintrag.bestellungen += 1;
    eintrag.umsatzNetto += Number(row.total_amount) || 0;
    if (!eintrag.letzteBestellung || row.created_at > eintrag.letzteBestellung) {
      eintrag.letzteBestellung = row.created_at as string;
    }
    map.set(id, eintrag);
  }
  return map;
}

export interface KundenDetail {
  kunde: AppUser;
  kondition: CustomerCondition | null;
  bestellungen: Pick<
    Order,
    | "id"
    | "order_number"
    | "status"
    | "total_amount"
    | "vat_rate"
    | "created_at"
    | "voucher_code"
    | "customer_discount_amount"
    | "voucher_discount_amount"
  >[];
  gutscheine: VoucherRow[];
}

export async function getKundenDetail(id: string): Promise<KundenDetail | null> {
  const supabase = await createClient();
  const [kunde, kondition, bestellungen, gutscheine] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("customer_conditions")
      .select("customer_id, discount_percent, note")
      .eq("customer_id", id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select(
        `id, order_number, status, total_amount, vat_rate, created_at,
         voucher_code, customer_discount_amount, voucher_discount_amount`,
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    getVouchers({ customerId: id }),
  ]);

  if (kunde.error || !kunde.data) {
    if (kunde.error) console.error("[kunden] Detail:", kunde.error.message);
    return null;
  }
  if (kondition.error) console.error("[kunden] Kondition:", kondition.error.message);
  if (bestellungen.error) console.error("[kunden] Bestellungen:", bestellungen.error.message);

  return {
    kunde: kunde.data as AppUser,
    kondition: (kondition.data as CustomerCondition | null) ?? null,
    bestellungen: (bestellungen.data ?? []) as KundenDetail["bestellungen"],
    gutscheine,
  };
}

/** Satz der Sonderkondition des angemeldeten Kunden, 0 ohne. */
export async function getMeineKondition(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("meine_kondition");
  if (error) {
    // Fehlt die Migration, rechnet der Shop wie vorher ohne Rabatt.
    console.error("[konditionen] eigene:", error.message);
    return 0;
  }
  return Number(data) || 0;
}
