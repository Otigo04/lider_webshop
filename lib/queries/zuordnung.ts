import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Belege, die noch keiner Bestellung zugeordnet sind (Migration 063): freie
 * Rechnungen und Kassenverkäufe. Für die Zuordnung in der Kundenakte.
 */

export interface ZuordenbareRechnung {
  id: string;
  nummer: string;
  datum: string;
  brutto: number | null;
  /** Kunde, auf den die Rechnung bisher lautet */
  kundeId: string;
  kunde: string;
}

export interface ZuordenbarerVerkauf {
  id: string;
  beleg: string;
  datum: string;
  brutto: number;
  zahlart: string;
  bezeichnung: string | null;
  /** Gehört der Verkauf schon zu einem Kundenkonto? */
  kundeId: string | null;
}

export interface Zuordenbares {
  rechnungen: ZuordenbareRechnung[];
  verkaeufe: ZuordenbarerVerkauf[];
  /** Migration 063 fehlt – die Zuordnung ist dann noch nicht möglich. */
  migrationFehlt: boolean;
}

const LIMIT = 500;

export async function getZuordenbares(): Promise<Zuordenbares> {
  const supabase = await createClient();

  const [rechnungen, verkaeufe] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, issued_at, total_amount, customer_id, customer:users (company_name, full_name, email)",
      )
      .eq("type", "manual")
      .is("order_id", null)
      .order("issued_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("pos_sales")
      .select(
        "id, receipt_number, created_at, total_amount, payment_method, customer_label, customer_id",
      )
      .is("order_id", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);

  if (rechnungen.error) {
    console.error("[zuordnung] Rechnungen:", rechnungen.error.message);
  }
  // 42703: Spalte pos_sales.order_id fehlt – Migration 063 ist noch nicht drin.
  const migrationFehlt = verkaeufe.error?.code === "42703";
  if (verkaeufe.error && !migrationFehlt) {
    console.error("[zuordnung] Verkäufe:", verkaeufe.error.message);
  }

  type RechnungRow = {
    id: string;
    invoice_number: string;
    issued_at: string;
    total_amount: number | string | null;
    customer_id: string;
    customer: { company_name: string | null; full_name: string | null; email: string } | null;
  };
  type VerkaufRow = {
    id: string;
    receipt_number: string;
    created_at: string;
    total_amount: number | string;
    payment_method: string;
    customer_label: string | null;
    customer_id: string | null;
  };

  return {
    migrationFehlt,
    rechnungen: ((rechnungen.data ?? []) as unknown as RechnungRow[]).map((r) => ({
      id: r.id,
      nummer: r.invoice_number,
      datum: r.issued_at,
      brutto: r.total_amount === null ? null : Number(r.total_amount),
      kundeId: r.customer_id,
      kunde:
        r.customer?.company_name || r.customer?.full_name || r.customer?.email || "–",
    })),
    verkaeufe: ((verkaeufe.data ?? []) as unknown as VerkaufRow[]).map((v) => ({
      id: v.id,
      beleg: v.receipt_number,
      datum: v.created_at,
      brutto: Number(v.total_amount),
      zahlart: v.payment_method === "card" ? "Karte" : "bar",
      bezeichnung: v.customer_label,
      kundeId: v.customer_id,
    })),
  };
}
