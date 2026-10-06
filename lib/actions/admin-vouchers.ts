"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { CODE_MUSTER, normalisiereCode, type GutscheinKern } from "@/lib/rabatt";

/*
 * Gutscheine und Sonderkonditionen (Migration 054). Geprüft und verrechnet
 * wird in der Datenbank – hier nur Pflege und die Vorschau im Bestellformular.
 */

/** Leeres Feld = nicht gesetzt. Datumsfelder kommen als YYYY-MM-DD. */
const optionalZahl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(String(v).replace(",", "."))),
  z.number().finite().optional(),
);
const optionalGanz = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().int().positive("Grenzen müssen mindestens 1 sein.").optional(),
);
const optionalDatum = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum").optional(),
);

const voucherSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z
      .string()
      .transform(normalisiereCode)
      .pipe(
        z
          .string()
          .regex(CODE_MUSTER, "Code: 3–32 Zeichen, nur Buchstaben, Ziffern und Bindestrich."),
      ),
    description: z.string().trim().max(300).optional(),
    kind: z.enum(["percent", "fixed"]),
    value: z.preprocess(
      (v) => Number(String(v ?? "").replace(",", ".")),
      z.number().finite().positive("Bitte einen Rabatt größer 0 angeben."),
    ),
    min_order_amount: optionalZahl,
    valid_from: optionalDatum,
    valid_until: optionalDatum,
    max_redemptions: optionalGanz,
    max_per_customer: optionalGanz,
    customer_id: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.string().uuid().optional(),
    ),
    is_active: z.boolean(),
  })
  .refine((d) => d.kind !== "percent" || d.value <= 100, {
    message: "Ein Prozentrabatt kann höchstens 100 % betragen.",
    path: ["value"],
  })
  .refine((d) => (d.min_order_amount ?? 0) >= 0, {
    message: "Der Mindestwert darf nicht negativ sein.",
    path: ["min_order_amount"],
  })
  .refine((d) => !d.valid_from || !d.valid_until || d.valid_until >= d.valid_from, {
    message: "„Gültig bis“ liegt vor „Gültig ab“.",
    path: ["valid_until"],
  });

/*
 * Ein Datum ohne Uhrzeit meint den ganzen Tag in Berlin: „gültig bis 31.12."
 * heißt bis Silvester 23:59, nicht bis Silvester 00:00 UTC. Postgres rechnet
 * die Zone um; hier wird nur der Tageswechsel (Sommer-/Winterzeit
 * beachtet) als Grenze gesetzt.
 */
function berlinOffset(datum: string): string {
  const teil = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${datum}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = teil?.replace("GMT", "");
  return offset ? offset : "+00:00";
}
function tagesbeginn(datum: string): string {
  return `${datum}T00:00:00${berlinOffset(datum)}`;
}
function tagesende(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const folgetag = d.toISOString().slice(0, 10);
  return `${folgetag}T00:00:00${berlinOffset(folgetag)}`;
}

function revalidate(customerId?: string | null) {
  revalidatePath("/admin/gutscheine");
  if (customerId) revalidatePath(`/admin/customers/${customerId}`);
}

export async function saveVoucher(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();

  const parsed = voucherSchema.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code") ?? "",
    description: formData.get("description") || undefined,
    kind: formData.get("kind"),
    value: formData.get("value"),
    min_order_amount: formData.get("min_order_amount"),
    valid_from: formData.get("valid_from"),
    valid_until: formData.get("valid_until"),
    max_redemptions: formData.get("max_redemptions"),
    max_per_customer: formData.get("max_per_customer"),
    customer_id: formData.get("customer_id"),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const zeile = {
    code: d.code,
    description: d.description || null,
    kind: d.kind,
    value: d.value,
    min_order_amount: d.min_order_amount ?? 0,
    valid_from: d.valid_from ? tagesbeginn(d.valid_from) : null,
    valid_until: d.valid_until ? tagesende(d.valid_until) : null,
    max_redemptions: d.max_redemptions ?? null,
    max_per_customer: d.max_per_customer ?? null,
    customer_id: d.customer_id ?? null,
    is_active: d.is_active,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("vouchers").update(zeile).eq("id", d.id)
    : await supabase.from("vouchers").insert({ ...zeile, created_by: admin.id });

  if (error) {
    if (error.code === "23505") return { error: `Den Code ${d.code} gibt es schon.` };
    console.error("[gutscheine] speichern:", error.code, error.message);
    return { error: "Der Gutschein konnte nicht gespeichert werden." };
  }

  revalidate(d.customer_id);
  return { success: d.id ? "Gutschein gespeichert." : `Gutschein ${d.code} angelegt.` };
}

export async function toggleVoucher(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const aktiv = formData.get("is_active") === "true";
  if (!id) return { error: "Kein Gutschein ausgewählt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vouchers")
    .update({ is_active: aktiv })
    .eq("id", id)
    .select("customer_id")
    .maybeSingle();

  if (error) {
    console.error("[gutscheine] umschalten:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }
  revalidate(data?.customer_id);
  return { success: aktiv ? "Gutschein aktiviert." : "Gutschein deaktiviert." };
}

export async function deleteVoucher(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Gutschein ausgewählt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vouchers")
    .delete()
    .eq("id", id)
    .select("customer_id")
    .maybeSingle();

  if (error) {
    // 23503: von einer Bestellung referenziert (ON DELETE RESTRICT)
    if (error.code === "23503") {
      return {
        error: "Der Gutschein wurde schon eingelöst und bleibt für die Bestellungen erhalten. Bitte deaktivieren.",
      };
    }
    console.error("[gutscheine] löschen:", error.message);
    return { error: "Der Gutschein konnte nicht gelöscht werden." };
  }
  revalidate(data?.customer_id);
  return { success: "Gutschein gelöscht." };
}

const konditionSchema = z.object({
  customer_id: z.string().uuid(),
  discount_percent: z.preprocess(
    (v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", "."))),
    z
      .number()
      .finite()
      .min(0, "Der Rabatt darf nicht negativ sein.")
      .max(99.99, "Der Rabatt muss unter 100 % liegen."),
  ),
  note: z.string().trim().max(500).optional(),
});

export async function saveCondition(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const parsed = konditionSchema.safeParse({
    customer_id: formData.get("customer_id"),
    discount_percent: formData.get("discount_percent"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  // 0 % ohne Notiz = keine Kondition: Zeile weg, statt eine Null zu pflegen.
  const { error } =
    d.discount_percent === 0 && !d.note
      ? await supabase.from("customer_conditions").delete().eq("customer_id", d.customer_id)
      : await supabase.from("customer_conditions").upsert({
          customer_id: d.customer_id,
          discount_percent: Math.round(d.discount_percent * 100) / 100,
          note: d.note || null,
          updated_at: new Date().toISOString(),
        });

  if (error) {
    console.error("[konditionen] speichern:", error.message);
    return { error: "Die Kondition konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${d.customer_id}`);
  return {
    success:
      d.discount_percent > 0
        ? "Sonderkondition gespeichert."
        : "Sonderkondition entfernt.",
  };
}

export interface GutscheinPruefung {
  gutschein?: GutscheinKern;
  error?: string;
}

/** Vorschau im Bestellformular. Verbindlich prüft create_order() erneut. */
export async function pruefeGutschein(code: string): Promise<GutscheinPruefung> {
  await requireUser("/checkout");
  const sauber = normalisiereCode(String(code ?? ""));
  if (!CODE_MUSTER.test(sauber)) return { error: "Dieser Gutscheincode ist ungültig." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gutschein_abfragen", { p_code: sauber });

  if (error) {
    // Eigene Meldungen (P0001) sind kundentauglich, alles andere ins Log.
    if (error.code === "P0001") return { error: error.message };
    console.error("[gutscheine] prüfen:", error.code, error.message);
    return { error: "Der Gutschein konnte gerade nicht geprüft werden." };
  }

  const g = data as GutscheinKern;
  return {
    gutschein: {
      code: g.code,
      kind: g.kind,
      value: Number(g.value),
      min_order_amount: Number(g.min_order_amount),
    },
  };
}
