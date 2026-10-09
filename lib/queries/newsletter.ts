import "server-only";
import { dokumentSchema, type NewsletterDokument } from "@/lib/newsletter";
import { createClient } from "@/lib/supabase/server";

/**
 * Daten für /admin/newsletter (Migration 065). Fehlen die Tabellen noch,
 * liefern die Abfragen leere Ergebnisse und `migrationFehlt`, statt die Seite
 * mit einem Fehler zu sprengen.
 */

export interface NewsletterZeile {
  id: string;
  betreff: string;
  status: "draft" | "sending" | "sent";
  erstellt: string;
  gesendetAm: string | null;
  gesendet: number;
  fehlgeschlagen: number;
  offen: number;
}

export async function getNewsletters(): Promise<{
  liste: NewsletterZeile[];
  migrationFehlt: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .select("id, subject, status, created_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    const fehlt = error.code === "42P01" || error.code === "PGRST205";
    if (!fehlt) console.error("[newsletter] Liste:", error.message);
    return { liste: [], migrationFehlt: fehlt };
  }

  const ids = (data ?? []).map((n) => n.id as string);
  const zaehler = new Map<string, { sent: number; failed: number; pending: number }>();
  if (ids.length > 0) {
    const { data: zeilen } = await supabase
      .from("newsletter_deliveries")
      .select("newsletter_id, status")
      .in("newsletter_id", ids)
      .limit(50000);
    for (const z of zeilen ?? []) {
      const eintrag = zaehler.get(z.newsletter_id as string) ?? { sent: 0, failed: 0, pending: 0 };
      eintrag[z.status as "sent" | "failed" | "pending"] += 1;
      zaehler.set(z.newsletter_id as string, eintrag);
    }
  }

  return {
    migrationFehlt: false,
    liste: (data ?? []).map((n) => {
      const z = zaehler.get(n.id as string) ?? { sent: 0, failed: 0, pending: 0 };
      return {
        id: n.id as string,
        betreff: n.subject as string,
        status: n.status as NewsletterZeile["status"],
        erstellt: n.created_at as string,
        gesendetAm: (n.sent_at as string | null) ?? null,
        gesendet: z.sent,
        fehlgeschlagen: z.failed,
        offen: z.pending,
      };
    }),
  };
}

export interface NewsletterDetail {
  id: string;
  status: "draft" | "sending" | "sent";
  dokument: NewsletterDokument;
  gesendet: number;
  fehlgeschlagen: number;
  offen: number;
}

export async function getNewsletter(id: string): Promise<NewsletterDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsletters")
    .select("id, subject, preheader, blocks, status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code !== "22P02") console.error("[newsletter] Detail:", error.message);
    return null;
  }
  if (!data) return null;

  // Ein Dokument, das dem Schema nicht mehr genügt (Baustein entfernt …),
  // wird mit den lesbaren Teilen geöffnet statt gar nicht.
  const dok = dokumentSchema.safeParse({
    betreff: data.subject,
    vorschautext: data.preheader ?? "",
    blocks: data.blocks,
  });
  const dokument: NewsletterDokument = dok.success
    ? dok.data
    : { betreff: String(data.subject ?? ""), vorschautext: String(data.preheader ?? ""), blocks: [] };

  const { data: zeilen } = await supabase
    .from("newsletter_deliveries")
    .select("status")
    .eq("newsletter_id", id)
    .limit(50000);
  const zahl = (s: string) => (zeilen ?? []).filter((z) => z.status === s).length;

  return {
    id: data.id as string,
    status: data.status as NewsletterDetail["status"],
    dokument,
    gesendet: zahl("sent"),
    fehlgeschlagen: zahl("failed"),
    offen: zahl("pending"),
  };
}

export interface Abonnent {
  id: string;
  name: string;
  email: string;
  seit: string | null;
}

export async function getAbonnenten(): Promise<{
  abonnenten: Abonnent[];
  kunden: number;
  migrationFehlt: boolean;
}> {
  const supabase = await createClient();
  const [abo, alle] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, company_name, newsletter_abo_at")
      .eq("role", "customer")
      .eq("is_active", true)
      .eq("newsletter_abo", true)
      .order("company_name"),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer")
      .eq("is_active", true),
  ]);

  if (abo.error) {
    const fehlt = abo.error.code === "42703";
    if (!fehlt) console.error("[newsletter] Abonnenten:", abo.error.message);
    return { abonnenten: [], kunden: alle.count ?? 0, migrationFehlt: fehlt };
  }
  return {
    migrationFehlt: false,
    kunden: alle.count ?? 0,
    abonnenten: (abo.data ?? []).map((u) => ({
      id: u.id as string,
      email: u.email as string,
      name: ((u.company_name || u.full_name) as string | null) ?? (u.email as string),
      seit: (u.newsletter_abo_at as string | null) ?? null,
    })),
  };
}

export interface ProduktAuswahl {
  id: string;
  name: string;
  sku: string;
}

/** Alle Artikel (schlank) für die Auswahl im Editor – Namenssuche im Browser. */
export async function getProduktAuswahl(): Promise<ProduktAuswahl[]> {
  const supabase = await createClient();
  const liste: ProduktAuswahl[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku")
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(von, von + 999);
    if (error) {
      console.error("[newsletter] Artikelauswahl:", error.message);
      break;
    }
    liste.push(...((data ?? []) as ProduktAuswahl[]));
    if ((data ?? []).length < 1000) break;
  }
  return liste;
}

export interface KundeAuswahl {
  id: string;
  name: string;
  email: string;
  abonniert: boolean;
}

/** Aktive Kunden für die Einzelauswahl (Namenssuche im Browser). */
export async function getKundenAuswahl(): Promise<KundeAuswahl[]> {
  const supabase = await createClient();
  const liste: KundeAuswahl[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, company_name, newsletter_abo")
      .eq("role", "customer")
      .eq("is_active", true)
      .order("company_name")
      .order("id")
      .range(von, von + 999);
    if (error) {
      // Fehlt die Spalte newsletter_abo (Migration 065), geht es ohne.
      if (error.code !== "42703") console.error("[newsletter] Kundenauswahl:", error.message);
      break;
    }
    for (const u of data ?? []) {
      liste.push({
        id: u.id as string,
        email: u.email as string,
        name: ((u.company_name || u.full_name) as string | null) ?? (u.email as string),
        abonniert: Boolean(u.newsletter_abo),
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return liste;
}
