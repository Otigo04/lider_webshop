"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { sendeAnGeraet } from "@/lib/push";
import { geraeteName, type SendeErgebnis } from "@/lib/push-ziele";
import { testText } from "@/lib/push-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PushAktion = { ok: true } | { ok: false; error: string };
export type TestAktion = { ok: true; ergebnis: SendeErgebnis } | { ok: false; error: string };

const FEHLER = "Das hat nicht geklappt. Bitte erneut versuchen.";

const abonnementSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine((u) => u.startsWith("https://"), "Push-Adresse muss https sein"),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(200),
  userAgent: z.string().max(500).default(""),
});

/**
 * Gerät anmelden oder erneuern. Upsert nach endpoint: Schlüssel, Besitzer und
 * Gerätename werden aktualisiert, die Schalter bleiben (sie stehen nicht im
 * Payload). Geschrieben mit dem Service-Key, weil ein Endpoint, der zuvor einem
 * anderen Admin gehörte, unter dessen RLS nicht übernommen werden könnte.
 */
export async function abonniere(
  eingabe: z.input<typeof abonnementSchema>,
): Promise<PushAktion> {
  const admin = await requireAdmin();
  const parsed = abonnementSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: "Das Gerät konnte nicht angemeldet werden." };

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: admin.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        geraet: geraeteName(parsed.data.userAgent),
      },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("[push] abonniere:", error.message);
    return { ok: false, error: "Das Gerät konnte nicht angemeldet werden." };
  }
  return { ok: true };
}

const schalterSchema = z.object({
  id: z.string().uuid(),
  feld: z.enum(["bei_bestellung", "bei_neukunde"]),
  an: z.boolean(),
});

/** RLS begrenzt auf eigene Zeilen; trifft nichts zu, war es nicht das eigene Gerät. */
export async function setzeSchalter(
  eingabe: z.input<typeof schalterSchema>,
): Promise<PushAktion> {
  await requireAdmin();
  const parsed = schalterSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: FEHLER };

  const { data, error } = await (await createClient())
    .from("push_subscriptions")
    .update({ [parsed.data.feld]: parsed.data.an })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[push] setzeSchalter:", error.message);
    return { ok: false, error: FEHLER };
  }
  return { ok: true };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function entferneGeraet(eingabe: z.input<typeof idSchema>): Promise<PushAktion> {
  await requireAdmin();
  const parsed = idSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: FEHLER };

  const { error } = await (await createClient())
    .from("push_subscriptions")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    console.error("[push] entferneGeraet:", error.message);
    return { ok: false, error: FEHLER };
  }
  return { ok: true };
}

/** Sendet sofort eine Probe an ein eigenes Gerät. */
export async function testeGeraet(eingabe: z.input<typeof idSchema>): Promise<TestAktion> {
  await requireAdmin();
  const parsed = idSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: FEHLER };

  const { data, error } = await (await createClient())
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Dieses Gerät wurde nicht gefunden." };

  return { ok: true, ergebnis: await sendeAnGeraet(data, testText()) };
}
