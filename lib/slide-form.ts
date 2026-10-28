import { z } from "zod";

/*
 * Gemeinsame Prüfung für Werbebilder der Startseite (home_slides) und Banner
 * der Warengruppen (category_banners). Beide haben dieselben Felder; nur der
 * Ordner im Bucket unterscheidet sich.
 */

/** Pfad im Bucket `products`: `<ordner>/<uuid>.<ext>`. */
export const bildPfad = (ordner: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${ordner}/[0-9a-f-]{36}\\.(jpe?g|png|webp|avif)$`, "i"),
      "Ungültiger Bildpfad",
    );

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
  z.preprocess(leerAlsUndefined, z.string().trim().max(max, meldung).optional());

const optionalDatum = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum").optional(),
);

export function slideSchema(ordner: string) {
  return z
    .object({
      id: z.string().uuid().optional(),
      title: optionalText(90, "Überschrift höchstens 90 Zeichen"),
      subtitle: optionalText(200, "Unterzeile höchstens 200 Zeichen"),
      cta_label: optionalText(40, "Knopftext höchstens 40 Zeichen"),
      link_url: z.preprocess(leerAlsUndefined, linkSchema.optional()),
      image_path: bildPfad(ordner),
      mobile_image_path: z.preprocess(
        (v) => (v === "" || v == null ? undefined : v),
        bildPfad(ordner).optional(),
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
}

export type SlideDaten = z.infer<ReturnType<typeof slideSchema>>;

export function berlinOffset(datum: string): string {
  const teil = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${datum}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  return teil?.replace("GMT", "") || "+00:00";
}

export function folgetag(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Spaltenwerte aus den geprüften Formulardaten. Laufzeit in ganzen Tagen in
 * Berlin: „bis 31.10." heißt bis zum Ende des 31.
 */
export function slideZeile(d: SlideDaten) {
  return {
    title: d.title ?? null,
    subtitle: d.subtitle ?? null,
    cta_label: d.link_url ? (d.cta_label ?? null) : null,
    link_url: d.link_url ?? null,
    image_path: d.image_path,
    mobile_image_path: d.mobile_image_path ?? null,
    tone: d.tone,
    is_active: d.is_active,
    valid_from: d.valid_from ? `${d.valid_from}T00:00:00${berlinOffset(d.valid_from)}` : null,
    valid_until: d.valid_until
      ? `${folgetag(d.valid_until)}T00:00:00${berlinOffset(folgetag(d.valid_until))}`
      : null,
  };
}

/** Formularfelder → Rohdaten für `slideSchema`. */
export function slideAusFormular(formData: FormData) {
  return {
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
  };
}
