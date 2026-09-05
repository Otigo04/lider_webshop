import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import type { PosDayClosing } from "@/lib/types";

/**
 * Kassentage und Z-Abschlüsse (Migration 025).
 *
 * Die Zahlen kommen aus zwei Quellen, die absichtlich nebeneinander stehen:
 * `pos_day_totals` rechnet live aus den Bons, `pos_day_closings` hält fest,
 * was beim Abschluss galt. Weichen beide ab, wurde nach dem Abschluss noch
 * gebucht – das soll die Übersicht zeigen und nicht überschreiben.
 */

export interface Kassentag {
  /** YYYY-MM-DD in Ladenzeit */
  datum: string;
  bons: number;
  netto: number;
  ust: number;
  brutto: number;
  bar: number;
  karte: number;
  ersterBeleg: string | null;
  letzterBeleg: string | null;
  /** null, solange der Tag nicht abgeschlossen ist */
  abschluss: PosDayClosing | null;
  /** Nach dem Abschluss wurde noch gebucht – Abschluss neu rechnen */
  abweichend: boolean;
  /**
   * Liegt vor der Automatik-Grenze (company_settings.pos_closing_from) und
   * wird deshalb nicht mehr von selbst abgeschlossen – manuell geht weiter.
   */
  ausgenommen: boolean;
  /** Der laufende Tag: Zahlen ändern sich noch */
  laufend: boolean;
}

interface TotalsRow {
  business_date: string;
  sales_count: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  cash_amount: number;
  card_amount: number;
  first_receipt: string | null;
  last_receipt: string | null;
}

/** Heutiger Kassentag in Ladenzeit – die Grenze zieht die Datenbank, nicht der Server. */
export async function getKassenHeute(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_heute");

  if (error || !data) {
    console.error("[kasse] Kassentag:", error?.message);
    // Notfalls die Serverzeit – schlechter als die Ladenzeit, aber besser als
    // eine Seite, die gar nichts anzeigt.
    return new Date().toISOString().slice(0, 10);
  }
  return data as string;
}

/**
 * Vergessene Tagesabschlüsse nachholen.
 *
 * Wird beim Öffnen der Kassenseiten aufgerufen. Bewusst kein Cron: wer die
 * Kasse öffnet, holt damit nach, was er am Vorabend vergessen hat, und die
 * Anwendung braucht keinen Scheduler, der still ausfallen kann.
 */
export async function holeAbschluesseNach(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_open_pos_days");

  if (error) {
    // Kein harter Fehler: die Übersicht funktioniert auch ohne Nachholen,
    // der Tag steht dann eben als offen darin.
    console.error("[kasse] Abschlüsse nachholen:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * Kassentage eines Zeitraums, beide Quellen zusammengeführt und absteigend
 * sortiert. Enthält auch Tage, die nur einen Abschluss ohne Umsatz haben –
 * ein Tag ohne Verkauf ist ein Ergebnis, keine Lücke.
 */
export async function getKassentage(
  von: string,
  bis: string,
): Promise<Kassentag[]> {
  const supabase = await createClient();
  const heute = await getKassenHeute();

  const [totals, closings, settings] = await Promise.all([
    supabase.rpc("pos_day_totals", { p_from: von, p_to: bis }),
    supabase
      .from("pos_day_closings")
      .select("*")
      .gte("business_date", von)
      .lte("business_date", bis)
      .order("business_date", { ascending: false }),
    supabase
      .from("company_settings")
      .select("pos_closing_from")
      .eq("id", true)
      .maybeSingle(),
  ]);

  const grenze =
    (settings.data?.pos_closing_from as string | null | undefined) ?? null;

  if (totals.error) console.error("[kasse] Tagessummen:", totals.error.message);
  if (closings.error) console.error("[kasse] Abschlüsse:", closings.error.message);

  const summen = new Map<string, TotalsRow>(
    ((totals.data ?? []) as TotalsRow[]).map((row) => [row.business_date, row]),
  );
  const abschluesse = new Map<string, PosDayClosing>(
    ((closings.data ?? []) as unknown as PosDayClosing[]).map((row) => [
      row.business_date,
      row,
    ]),
  );

  const tage = [...new Set([...summen.keys(), ...abschluesse.keys()])].sort(
    (a, b) => b.localeCompare(a),
  );

  return tage.map((datum) => {
    const summe = summen.get(datum);
    const abschluss = abschluesse.get(datum) ?? null;
    const brutto = toNumber(summe?.gross_amount);
    const bons = Number(summe?.sales_count ?? 0);

    return {
      datum,
      bons,
      netto: toNumber(summe?.net_amount),
      ust: toNumber(summe?.vat_amount),
      brutto,
      bar: toNumber(summe?.cash_amount),
      karte: toNumber(summe?.card_amount),
      ersterBeleg: summe?.first_receipt ?? abschluss?.first_receipt ?? null,
      letzterBeleg: summe?.last_receipt ?? abschluss?.last_receipt ?? null,
      abschluss,
      // Cent-genauer Vergleich: die Beträge sind NUMERIC(12,2), da gibt es
      // keine Fließkomma-Unschärfe zu dämpfen.
      abweichend:
        abschluss !== null &&
        (toNumber(abschluss.gross_amount) !== brutto ||
          Number(abschluss.sales_count) !== bons),
      ausgenommen: grenze !== null && datum < grenze,
      laufend: datum === heute,
    };
  });
}

/** Ein einzelner Abschluss, für den Z-Bon. */
export async function getAbschluss(datum: string): Promise<PosDayClosing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_day_closings")
    .select("*")
    .eq("business_date", datum)
    .maybeSingle();

  if (error) {
    console.error("[kasse] Abschluss laden:", error.message);
    return null;
  }
  return (data as unknown as PosDayClosing) ?? null;
}
