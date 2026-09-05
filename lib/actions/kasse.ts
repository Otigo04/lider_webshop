"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Tagesabschluss (Z) auslösen.
 *
 * Gerechnet wird ausschließlich in der Datenbank (close_pos_day, Migration
 * 025) – wie überall in diesem Projekt: der Browser zeigt Summen an, er
 * bildet sie nicht.
 */

const schema = z.object({
  // Kassentag als YYYY-MM-DD. Kein Date-Objekt: die Tagesgrenze zieht die
  // Datenbank in Ladenzeit, der Server hat damit nichts zu tun.
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum."),
  notiz: z.string().trim().max(500).optional(),
});

export async function tagAbschliessen(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    datum: formData.get("datum"),
    notiz: formData.get("notiz") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_pos_day", {
    p_date: parsed.data.datum,
    p_note: parsed.data.notiz ?? null,
    p_automatic: false,
  });

  if (error || !data) {
    console.error("[kasse] Tagesabschluss:", error?.message);
    // Meldungen der Datenbank durchreichen: "Ein künftiger Tag lässt sich
    // nicht abschließen." ist genau das, was hier gebraucht wird.
    return { error: error?.message ?? "Der Tag konnte nicht abgeschlossen werden." };
  }

  const abschluss = data as { z_number: string };

  revalidatePath("/kasse/tagesabschluss");
  revalidatePath("/kasse");

  return { success: `Tagesabschluss ${abschluss.z_number} gebucht.` };
}

/**
 * Einen Tagesabschluss zurücknehmen.
 *
 * Im laufenden Betrieb die Ausnahme – gedacht für Probeabschlüsse aus der
 * Einrichtungsphase. Die Verkäufe des Tages bleiben unangetastet, nur die
 * Festschreibung fällt weg; der Tag lässt sich danach neu abschließen.
 *
 * Die Z-Nummer bleibt verbraucht (siehe Migration 026), und die Automatik
 * rückt hinter den gelöschten Tag – sonst stünde er beim nächsten Aufruf der
 * Seite wieder da.
 */
export async function abschlussLoeschen(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const datum = String(formData.get("datum") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return { error: "Ungültiges Datum." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_pos_day_closing", {
    p_date: datum,
  });

  if (error) {
    console.error("[kasse] Abschluss löschen:", error.message);
    return { error: error.message || "Der Abschluss konnte nicht gelöscht werden." };
  }

  revalidatePath("/kasse/tagesabschluss");
  revalidatePath("/kasse");

  return data === true
    ? { success: "Tagesabschluss gelöscht." }
    : { error: "Für diesen Tag gab es keinen Abschluss." };
}

/**
 * Alle Tagesabschlüsse verwerfen und die Z-Nummerierung auf Z00001
 * zurücksetzen.
 *
 * Nur für die Einrichtung, bevor echt kassiert wird: Nummern neu zu vergeben
 * ist gefährlich, sobald ein Z-Bon gedruckt wurde. Die Oberfläche verlangt
 * deshalb eine getippte Bestätigung, und die wird hier noch einmal geprüft –
 * ein Formularfeld ist keine Zusicherung.
 */
export async function abschluesseZuruecksetzen(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  if (String(formData.get("bestaetigung") ?? "").trim() !== "ZURÜCKSETZEN") {
    return { error: "Bitte ZURÜCKSETZEN eintippen, um zu bestätigen." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_pos_day_closings");

  if (error) {
    console.error("[kasse] Abschlüsse zurücksetzen:", error.message);
    return { error: error.message || "Die Abschlüsse konnten nicht verworfen werden." };
  }

  revalidatePath("/kasse/tagesabschluss");
  revalidatePath("/kasse");

  const anzahl = Number(data ?? 0);
  return {
    success:
      anzahl === 1
        ? "1 Tagesabschluss verworfen, Nummerierung beginnt wieder bei Z00001."
        : `${anzahl} Tagesabschlüsse verworfen, Nummerierung beginnt wieder bei Z00001.`,
  };
}
