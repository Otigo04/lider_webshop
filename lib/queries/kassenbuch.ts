import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";

export interface CashEntry {
  id: string;
  entry_date: string;
  cash: number;
  card: number;
  wholesale: number;
  note: string | null;
}

/** Heutiger Kalendertag in Berlin als YYYY-MM-DD. */
export function heuteBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Einträge eines Monats (YYYY-MM), neueste zuerst. */
export async function getCashEntries(monat: string): Promise<CashEntry[]> {
  const [jahr, mon] = monat.split("-").map(Number);
  const von = `${monat}-01`;
  const folge = mon === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(mon + 1).padStart(2, "0")}-01`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_entries")
    .select("id, entry_date, cash, card, wholesale, note")
    .gte("entry_date", von)
    .lt("entry_date", folge)
    .order("entry_date", { ascending: false });

  if (error) {
    console.error("[kassenbuch] laden:", error.message);
    return [];
  }
  return (data ?? []).map((e) => ({
    ...e,
    cash: toNumber(e.cash),
    card: toNumber(e.card),
    wholesale: toNumber(e.wholesale),
  }));
}
