"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { dokumentSchema, startDokument } from "@/lib/newsletter";
import { baueNewsletterHtml, ladeNewsletterInhalt } from "@/lib/newsletter-mail";
import { versendeEinzeln, versendeNewsletter } from "@/lib/newsletter-senden";
import { getCompanySettings } from "@/lib/queries/settings";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";

/**
 * Newsletter anlegen, bearbeiten, testen, verschicken (Migration 065).
 * Verschickt wird ausschließlich in lib/newsletter-senden.ts.
 */

const idSchema = z.string().uuid();

export async function createNewsletter(): Promise<void> {
  const user = await requireAdmin();
  const dok = startDokument();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .insert({
      subject: dok.betreff,
      preheader: dok.vorschautext,
      blocks: dok.blocks,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[newsletter] Anlegen:", error?.message);
    redirect("/admin/newsletter?fehler=anlegen");
  }
  revalidatePath("/admin/newsletter");
  redirect(`/admin/newsletter/${data.id}`);
}

/** Autospeichern des ganzen Dokuments. Nur Entwürfe lassen sich ändern. */
export async function saveNewsletter(id: string, dokument: unknown): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Newsletter ausgewählt." };

  const parsed = dokumentSchema.safeParse(dokument);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .update({
      subject: parsed.data.betreff,
      preheader: parsed.data.vorschautext || null,
      blocks: parsed.data.blocks,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("[newsletter] Speichern:", error.message);
    return { error: "Konnte nicht gespeichert werden." };
  }
  if (!data?.length) return { error: "Dieser Newsletter ist schon verschickt und lässt sich nicht mehr ändern." };
  return {};
}

export async function duplicateNewsletter(id: string): Promise<AdminFormState> {
  const user = await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Newsletter ausgewählt." };

  const supabase = await createClient();
  const { data: quelle } = await supabase
    .from("newsletters")
    .select("subject, preheader, blocks")
    .eq("id", id)
    .maybeSingle();
  if (!quelle) return { error: "Der Newsletter wurde nicht gefunden." };

  const { error } = await supabase.from("newsletters").insert({
    subject: `${String(quelle.subject).slice(0, 135)} (Kopie)`,
    preheader: quelle.preheader,
    blocks: quelle.blocks,
    created_by: user.id,
  });
  if (error) return { error: "Der Newsletter konnte nicht kopiert werden." };
  revalidatePath("/admin/newsletter");
  return { success: "Kopie angelegt." };
}

/** Für ConfirmAction: nur Entwürfe. Verschickte bleiben als Archiv. */
export async function deleteNewsletter(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Kein Newsletter ausgewählt." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .delete()
    .eq("id", id.data)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: "Der Newsletter konnte nicht gelöscht werden." };
  if (!data?.length) return { error: "Verschickte Newsletter bleiben im Archiv." };
  revalidatePath("/admin/newsletter");
  return { success: "Entwurf gelöscht." };
}

/** Testmail an die eigene Adresse – genau das HTML, das später rausgeht. */
export async function sendeTestmail(id: string): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Newsletter ausgewählt." };
  if (!process.env.RESEND_API_KEY) return { error: "RESEND_API_KEY fehlt – es kann nichts verschickt werden." };

  const supabase = await createClient();
  const { data } = await supabase
    .from("newsletters")
    .select("subject, preheader, blocks")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "Der Newsletter wurde nicht gefunden." };

  const dok = dokumentSchema.safeParse({
    betreff: data.subject,
    vorschautext: data.preheader ?? "",
    blocks: data.blocks,
  });
  if (!dok.success) return { error: dok.error.issues[0].message };

  const [firma, inhalt] = await Promise.all([
    getCompanySettings(),
    ladeNewsletterInhalt(supabase, dok.data.blocks),
  ]);
  const html = baueNewsletterHtml({
    dokument: dok.data,
    inhalt,
    firma,
    abmeldeUrl: "#",
  });
  await sendEmail({ to: admin.email, subject: `[Test] ${dok.data.betreff}`, html });
  return { success: `Testmail an ${admin.email} geschickt.` };
}

function meldung(e: Awaited<ReturnType<typeof versendeNewsletter>>): AdminFormState {
  if (!e.ok) return { error: e.error };
  if (e.offen > 0) {
    return {
      success: `${e.gesendet} verschickt, ${e.offen} noch offen – bitte „Versand fortsetzen“ klicken.`,
    };
  }
  if (e.fehlgeschlagen > 0) {
    return {
      error: `${e.gesendet} verschickt, ${e.fehlgeschlagen} fehlgeschlagen. „Fehlgeschlagene wiederholen“ versucht es noch einmal.`,
    };
  }
  return { success: `Newsletter an ${e.gesendet} Abonnenten verschickt.` };
}

/** An alle Abonnenten schicken – oder einen unterbrochenen Versand fortsetzen. */
export async function sendeNewsletter(id: string): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Newsletter ausgewählt." };
  const erg = await versendeNewsletter(id);
  revalidatePath("/admin/newsletter");
  revalidatePath(`/admin/newsletter/${id}`);
  return meldung(erg);
}

export async function wiederholeFehlgeschlagene(id: string): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Newsletter ausgewählt." };
  const erg = await versendeNewsletter(id, { fehlerWiederholen: true });
  revalidatePath("/admin/newsletter");
  revalidatePath(`/admin/newsletter/${id}`);
  return meldung(erg);
}


/**
 * An einzelne Kunden und/oder einzelne Adressen schicken (Adressen getrennt
 * durch Komma, Semikolon oder Zeilenumbruch). Ändert den Status des
 * Newsletters nicht.
 */
export async function sendeEinzeln(
  id: string,
  userIds: string[],
  adressen: string,
): Promise<AdminFormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { error: "Kein Newsletter ausgewählt." };
  const ids = z.array(z.string().uuid()).max(500).safeParse(userIds);
  if (!ids.success) return { error: "Ungültige Kundenauswahl." };

  const erg = await versendeEinzeln(id, {
    userIds: ids.data,
    emails: adressen.split(/[\s,;]+/).filter(Boolean),
  });
  revalidatePath("/admin/newsletter");
  revalidatePath(`/admin/newsletter/${id}`);

  if (!erg.ok) return { error: erg.error };
  const teile = [
    erg.gesendet > 0 ? `${erg.gesendet} verschickt` : "Nichts verschickt",
    erg.bereitsErhalten > 0 ? `${erg.bereitsErhalten} hatten ihn schon` : null,
    erg.ungueltig.length > 0 ? `ungültig: ${erg.ungueltig.join(", ")}` : null,
  ].filter(Boolean);
  return { success: `${teile.join(" · ")}.` };
}
