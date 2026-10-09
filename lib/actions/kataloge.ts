"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Kataloge (Migration 051): anlegen, einstellen, zusammenstellen.
 *
 * Die Werkbank hat keinen Speichern-Knopf – jede Änderung kommt einzeln hier
 * an. Deshalb sind die Actions klein und tun je eine Sache; die Oberfläche
 * zeigt die Änderung sofort und nimmt sie zurück, wenn hier ein Fehler
 * zurückkommt.
 */

const idSchema = z.string().uuid();
const idsSchema = z.array(z.string().uuid()).min(1).max(5000);

/** So viele Zeilen gehen je Anfrage an die Datenbank. */
const BLOCK = 500;

const leerZuNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen`)
    .transform((wert) => (wert === "" ? null : wert));

/**
 * Je Feld ein Schema und die Spalte dazu. Ein Feldname, der hier nicht
 * steht, wird abgewiesen – wie bei updateProductField(): die Action nimmt
 * den Namen vom Client entgegen, und der darf keine beliebige Spalte treffen.
 */
const FELDER = {
  title: { spalte: "title", schema: z.string().trim().min(1, "Der Titel fehlt").max(120, "Höchstens 120 Zeichen") },
  subtitle: { spalte: "subtitle", schema: leerZuNull(160) },
  layout: { spalte: "layout", schema: z.enum(["liste", "kacheln", "gross"]) },
  stil: { spalte: "stil", schema: z.enum(["sachlich", "prospekt"]) },
  preisart: { spalte: "preisart", schema: z.enum(["grosshandel", "laden", "ohne"]) },
  zeigeBarcode: { spalte: "zeige_barcode", schema: z.boolean() },
  zeigeBestand: { spalte: "zeige_bestand", schema: z.boolean() },
  zeigeBeschreibung: { spalte: "zeige_beschreibung", schema: z.boolean() },
  zeigeMerkmale: { spalte: "zeige_merkmale", schema: z.boolean() },
  zeigeKennzeichen: { spalte: "zeige_kennzeichen", schema: z.boolean() },
  mitTitelseite: { spalte: "mit_titelseite", schema: z.boolean() },
  mitInhalt: { spalte: "mit_inhalt", schema: z.boolean() },
  mitTrennseiten: { spalte: "mit_trennseiten", schema: z.boolean() },
  reduziertZuerst: { spalte: "reduziert_zuerst", schema: z.boolean() },
  auchOhneFoto: { spalte: "auch_ohne_foto", schema: z.boolean() },
  mitRueckseite: { spalte: "mit_rueckseite", schema: z.boolean() },
  rueckseiteText: { spalte: "rueckseite_text", schema: leerZuNull(1200) },
} as const;

export type KatalogFeld = keyof typeof FELDER;

type Client = Awaited<ReturnType<typeof createClient>>;

/** „Zuletzt geändert" soll auch gelten, wenn nur die Auswahl angefasst wurde. */
async function beruehre(supabase: Client, id: string) {
  await supabase
    .from("catalogs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Legt einen leeren Katalog an und springt in die Werkbank. */
export async function createKatalog(): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalogs")
    .insert({ title: "Neuer Katalog", created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[kataloge] Anlegen:", error?.message);
    redirect("/admin/kataloge?fehler=anlegen");
  }

  revalidatePath("/admin/kataloge");
  redirect(`/admin/kataloge/${data.id}`);
}

/**
 * Kopie eines Katalogs samt Auswahl – der übliche Weg zur nächsten Ausgabe
 * eines Aktionshefts.
 */
export async function duplicateKatalog(id: string): Promise<AdminFormState> {
  const user = await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };

  const supabase = await createClient();
  const { data: quelle, error } = await supabase
    .from("catalogs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !quelle) return { error: "Der Katalog wurde nicht gefunden." };

  // Alles übernehmen, was den Katalog beschreibt – nur nicht, was ihn
  // ausweist. Kommt später eine Einstellung dazu, reist sie von selbst mit.
  const felder = { ...(quelle as Record<string, unknown>) };
  for (const spalte of ["id", "created_at", "updated_at", "created_by"]) {
    delete felder[spalte];
  }

  const { data: kopie, error: fehler } = await supabase
    .from("catalogs")
    .insert({
      ...felder,
      title: `${String(felder.title).slice(0, 110)} (Kopie)`,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (fehler || !kopie) {
    console.error("[kataloge] Kopieren:", fehler?.message);
    return { error: "Der Katalog konnte nicht kopiert werden." };
  }

  for (let von = 0; ; von += BLOCK) {
    const { data: zeilen } = await supabase
      .from("catalog_items")
      .select("product_id, position, bald")
      .eq("catalog_id", id)
      .order("position")
      .order("product_id")
      .range(von, von + BLOCK - 1);
    if (!zeilen || zeilen.length === 0) break;

    const { error: einfuegen } = await supabase.from("catalog_items").insert(
      zeilen.map((z) => ({
        catalog_id: kopie.id,
        product_id: z.product_id,
        position: z.position,
        bald: z.bald,
      })),
    );
    if (einfuegen) {
      console.error("[kataloge] Auswahl kopieren:", einfuegen.message);
      // Eine halbe Kopie sähe aus wie eine ganze – lieber keine.
      await supabase.from("catalogs").delete().eq("id", kopie.id);
      return { error: "Die Auswahl konnte nicht kopiert werden." };
    }
    if (zeilen.length < BLOCK) break;
  }

  revalidatePath("/admin/kataloge");
  return { success: "Kopie angelegt." };
}

/** Für ConfirmAction: die Kennung reist als Formularfeld `id`. */
export async function deleteKatalog(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = formData.get("id");
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };

  const supabase = await createClient();
  const { error } = await supabase.from("catalogs").delete().eq("id", id);
  if (error) {
    console.error("[kataloge] Löschen:", error.message);
    return { error: "Der Katalog konnte nicht gelöscht werden." };
  }

  revalidatePath("/admin/kataloge");
  return { success: "Katalog gelöscht." };
}

/** Eine einzelne Einstellung ändern. */
export async function updateKatalogFeld(
  id: string,
  feld: KatalogFeld,
  wert: unknown,
): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };

  const eintrag = Object.hasOwn(FELDER, feld) ? FELDER[feld] : null;
  if (!eintrag) return { error: "Dieses Feld lässt sich nicht ändern." };

  const parsed = eintrag.schema.safeParse(wert);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogs")
    .update({ [eintrag.spalte]: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[kataloge] Feld ändern:", error.message);
    return { error: "Die Änderung konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/kataloge");
  return {};
}

/**
 * Artikel ans Ende der Zusammenstellung hängen.
 *
 * `ignoreDuplicates`: ein Artikel steht je Katalog einmal. Wer „ganze
 * Warengruppe" drückt, obwohl die halbe Gruppe schon drin ist, soll die
 * fehlende Hälfte bekommen und keinen Fehler.
 */
export async function addKatalogArtikel(
  id: string,
  productIds: string[],
): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };
  const parsed = idsSchema.safeParse(productIds);
  if (!parsed.success) return { error: "Keine Artikel ausgewählt." };

  const supabase = await createClient();
  const { data: letzte } = await supabase
    .from("catalog_items")
    .select("position")
    .eq("catalog_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = ((letzte as { position: number } | null)?.position ?? -1) + 1;

  for (let i = 0; i < parsed.data.length; i += BLOCK) {
    const { error } = await supabase.from("catalog_items").upsert(
      parsed.data.slice(i, i + BLOCK).map((productId, index) => ({
        catalog_id: id,
        product_id: productId,
        position: start + i + index,
      })),
      { onConflict: "catalog_id,product_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[kataloge] Artikel hinzufügen:", error.message);
      return { error: "Die Artikel konnten nicht hinzugefügt werden." };
    }
  }

  await beruehre(supabase, id);
  revalidatePath("/admin/kataloge");
  return {};
}

export async function removeKatalogArtikel(
  id: string,
  productIds: string[],
): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };
  const parsed = idsSchema.safeParse(productIds);
  if (!parsed.success) return { error: "Keine Artikel ausgewählt." };

  const supabase = await createClient();
  // Kleinere Blöcke als beim Schreiben: die Kennungen reisen hier in der
  // Adresszeile.
  for (let i = 0; i < parsed.data.length; i += 150) {
    const { error } = await supabase
      .from("catalog_items")
      .delete()
      .eq("catalog_id", id)
      .in("product_id", parsed.data.slice(i, i + 150));
    if (error) {
      console.error("[kataloge] Artikel entfernen:", error.message);
      return { error: "Die Artikel konnten nicht entfernt werden." };
    }
  }

  await beruehre(supabase, id);
  revalidatePath("/admin/kataloge");
  return {};
}

/**
 * Artikel in den Abschnitt „Bald im Sortiment" stellen oder zurück ins
 * Sortiment holen. Ein Merkmal dieser Zusammenstellung, nicht des Artikels.
 */
export async function setKatalogBald(
  id: string,
  productIds: string[],
  bald: boolean,
): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };
  const parsed = idsSchema.safeParse(productIds);
  if (!parsed.success) return { error: "Keine Artikel ausgewählt." };

  const supabase = await createClient();
  for (let i = 0; i < parsed.data.length; i += 150) {
    const { error } = await supabase
      .from("catalog_items")
      .update({ bald })
      .eq("catalog_id", id)
      .in("product_id", parsed.data.slice(i, i + 150));
    if (error) {
      console.error("[kataloge] Bald setzen:", error.message);
      return {
        error:
          error.code === "42703"
            ? "Dafür fehlt noch die Datenbankänderung 060."
            : "Die Änderung konnte nicht gespeichert werden.",
      };
    }
  }

  await beruehre(supabase, id);
  revalidatePath("/admin/kataloge");
  return {};
}

/**
 * Reihenfolge der ganzen Zusammenstellung neu schreiben.
 *
 * Durchnummeriert statt zwei Positionen zu tauschen: nach Entfernen und
 * Hinzufügen haben die Positionen Lücken und Gleichstände, und ein Tausch
 * zweier gleicher Zahlen bewegt nichts.
 *
 * Geschrieben wird per Upsert auf vorhandene Zeilen. Eine Kennung, die nicht
 * (mehr) im Katalog steht, käme dadurch wieder hinein – deshalb wird vorher
 * gegen den Bestand abgeglichen.
 */
export async function setKatalogReihenfolge(
  id: string,
  productIds: string[],
): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Katalog ausgewählt." };
  const parsed = idsSchema.safeParse(productIds);
  if (!parsed.success) return { error: "Keine Artikel ausgewählt." };

  const supabase = await createClient();

  const vorhanden = new Set<string>();
  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase
      .from("catalog_items")
      .select("product_id")
      .eq("catalog_id", id)
      .order("product_id")
      .range(von, von + 999);
    if (error) {
      console.error("[kataloge] Reihenfolge lesen:", error.message);
      return { error: "Die Reihenfolge konnte nicht gespeichert werden." };
    }
    for (const z of data ?? []) vorhanden.add(z.product_id as string);
    if ((data ?? []).length < 1000) break;
  }

  const zeilen = parsed.data
    .filter((productId) => vorhanden.has(productId))
    .map((productId, index) => ({
      catalog_id: id,
      product_id: productId,
      position: index,
    }));

  for (let i = 0; i < zeilen.length; i += BLOCK) {
    const { error } = await supabase
      .from("catalog_items")
      .upsert(zeilen.slice(i, i + BLOCK), { onConflict: "catalog_id,product_id" });
    if (error) {
      console.error("[kataloge] Reihenfolge schreiben:", error.message);
      return { error: "Die Reihenfolge konnte nicht gespeichert werden." };
    }
  }

  await beruehre(supabase, id);
  return {};
}
