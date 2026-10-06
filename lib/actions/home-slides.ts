"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/*
 * Werbebilder der Startseite (Migration 055). Die Bilder lädt der Browser
 * direkt in den Storage (startseite/<uuid>.<ext>), hier kommt nur der Pfad an
 * – wie beim Kachelbild der Warengruppe.
 */

const pfadSchema = z
  .string()
  .regex(/^startseite\/[0-9a-f-]{36}\.(jpe?g|png|webp|avif)$/i, "Ungültiger Bildpfad");

// Wie bei der Hinweisleiste: eigener Pfad oder volle http(s)-Adresse.
const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (wert) => /^\/(?!\/)/.test(wert) || /^https?:\/\//i.test(wert),
    "Link muss mit / oder https:// beginnen",
  );

// Leer oder gar nicht mitgeschickt = nicht gesetzt. Ein deaktiviertes Feld
// (Knopftext ohne Link) fehlt im Formular ganz und kommt als null an.
const leerAlsUndefined = (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") ? undefined : v;

const optionalText = (max: number, meldung: string) =>
  z.preprocess(
    leerAlsUndefined,
    z.string().trim().max(max, meldung).optional(),
  );

const optionalDatum = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum").optional(),
);

const slideSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: optionalText(90, "Überschrift höchstens 90 Zeichen"),
    subtitle: optionalText(200, "Unterzeile höchstens 200 Zeichen"),
    cta_label: optionalText(40, "Knopftext höchstens 40 Zeichen"),
    link_url: z.preprocess(leerAlsUndefined, linkSchema.optional()),
    image_path: pfadSchema,
    mobile_image_path: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      pfadSchema.optional(),
    ),
    tone: z.enum(["dark", "light"]),
    is_active: z.boolean(),
    valid_from: optionalDatum,
    valid_until: optionalDatum,
  })
  .refine((d) => !d.valid_from || !d.valid_until || d.valid_until >= d.valid_from, {
    message: "„Bis“ liegt vor „Ab“.",
    path: ["valid_until"],
  });

function berlinOffset(datum: string): string {
  const teil = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${datum}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  return teil?.replace("GMT", "") || "+00:00";
}

function folgetag(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function neuLaden() {
  revalidatePath("/");
  revalidatePath("/admin/startseite");
}

export async function saveSlide(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = slideSchema.safeParse({
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    subtitle: formData.get("subtitle"),
    cta_label: formData.get("cta_label"),
    link_url: formData.get("link_url"),
    image_path: formData.get("image_path") ?? "",
    mobile_image_path: formData.get("mobile_image_path"),
    tone: formData.get("tone") || "dark",
    is_active: formData.get("is_active") === "on",
    valid_from: formData.get("valid_from"),
    valid_until: formData.get("valid_until"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const zeile = {
    title: d.title ?? null,
    subtitle: d.subtitle ?? null,
    cta_label: d.link_url ? (d.cta_label ?? null) : null,
    link_url: d.link_url ?? null,
    image_path: d.image_path,
    mobile_image_path: d.mobile_image_path ?? null,
    tone: d.tone,
    is_active: d.is_active,
    // Ganze Tage in Berlin: „bis 31.10." heißt bis zum Ende des 31.
    valid_from: d.valid_from ? `${d.valid_from}T00:00:00${berlinOffset(d.valid_from)}` : null,
    valid_until: d.valid_until
      ? `${folgetag(d.valid_until)}T00:00:00${berlinOffset(folgetag(d.valid_until))}`
      : null,
  };

  const supabase = await createClient();

  // Beim Austauschen eines Bildes die alte Datei aufräumen – erst nachdem der
  // neue Pfad gespeichert ist, sonst zeigte die Zeile kurz ins Leere.
  let alt: { image_path: string; mobile_image_path: string | null } | null = null;
  if (d.id) {
    const { data } = await supabase
      .from("home_slides")
      .select("image_path, mobile_image_path")
      .eq("id", d.id)
      .maybeSingle();
    alt = data;
  }

  let error;
  if (d.id) {
    ({ error } = await supabase.from("home_slides").update(zeile).eq("id", d.id));
  } else {
    // Neue Bilder hinten anstellen.
    const { data: letzte } = await supabase
      .from("home_slides")
      .select("order_index")
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("home_slides")
      .insert({ ...zeile, order_index: (letzte?.order_index ?? -1) + 1 }));
  }

  if (error) {
    console.error("[slider] speichern:", error.message);
    return { error: "Das Werbebild konnte nicht gespeichert werden." };
  }

  if (alt) {
    const weg = [alt.image_path, alt.mobile_image_path].filter(
      (p): p is string => Boolean(p) && p !== zeile.image_path && p !== zeile.mobile_image_path,
    );
    if (weg.length > 0) await supabase.storage.from(PRODUCT_BUCKET).remove(weg);
  }

  neuLaden();
  return { success: d.id ? "Werbebild gespeichert." : "Werbebild angelegt." };
}

export async function deleteSlide(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kein Werbebild ausgewählt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_slides")
    .delete()
    .eq("id", id)
    .select("image_path, mobile_image_path")
    .maybeSingle();

  if (error) {
    console.error("[slider] löschen:", error.message);
    return { error: "Das Werbebild konnte nicht gelöscht werden." };
  }
  if (data) {
    const pfade = [data.image_path, data.mobile_image_path].filter(Boolean) as string[];
    await supabase.storage.from(PRODUCT_BUCKET).remove(pfade);
  }

  neuLaden();
  return { success: "Werbebild gelöscht." };
}

export async function toggleSlide(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const aktiv = formData.get("is_active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("home_slides").update({ is_active: aktiv }).eq("id", id);
  if (error) {
    console.error("[slider] umschalten:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }
  neuLaden();
  return { success: aktiv ? "Werbebild eingeblendet." : "Werbebild ausgeblendet." };
}

/** Reihenfolge verschieben: tauscht mit dem Nachbarn oben oder unten. */
export async function moveSlide(id: string, richtung: "hoch" | "runter"): Promise<AdminFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_slides")
    .select("id, order_index")
    .order("order_index")
    .order("created_at");
  if (error || !data) return { error: "Die Reihenfolge konnte nicht geändert werden." };

  const i = data.findIndex((s) => s.id === id);
  const j = richtung === "hoch" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= data.length) return {};

  // Neu durchnummerieren statt nur zwei Werte tauschen: gleiche order_index
  // (z. B. zwei Zeilen mit 0) ließen sich sonst nie trennen.
  const liste = [...data];
  [liste[i], liste[j]] = [liste[j], liste[i]];
  const ergebnisse = await Promise.all(
    liste.map((s, index) =>
      s.order_index === index
        ? null
        : supabase.from("home_slides").update({ order_index: index }).eq("id", s.id),
    ),
  );
  if (ergebnisse.some((r) => r?.error)) {
    return { error: "Die Reihenfolge konnte nicht geändert werden." };
  }

  neuLaden();
  return {};
}
