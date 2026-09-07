import "server-only";
import { INVOICE_BUCKET, PRODUCT_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Der Bucket `products` ist privat. Produktfotos sind deshalb nur über Signed
 * URLs erreichbar, die hier serverseitig erzeugt werden. Für nicht angemeldete
 * Besucher ist das Schaufenster gewollt lesbar
 * (supabase/migrations/012_bildzugriff_ohne_produkt_rls.sql), Bestände und
 * Staffeln bleiben davon unberührt.
 */

/** Gültigkeit der Signed URLs für Produktfotos in Sekunden. */
const SIGNED_URL_TTL = 12 * 60 * 60;

/**
 * Wie lange eine erzeugte URL wiederverwendet wird. Deutlich kürzer als die
 * Gültigkeit, damit niemand eine URL bekommt, die ihm gleich darauf unter den
 * Händen abläuft.
 */
const CACHE_TTL_MS = 10 * 60 * 60 * 1000;

/**
 * Zwischenspeicher für signierte Bild-URLs.
 *
 * Ohne ihn erzeugt jeder Seitenaufruf frische Signaturen, und weil die
 * Signatur Teil der URL ist, ändert sich damit auch die Bildadresse. Der
 * Bildcache von next/image trifft dann nie: jedes Foto wird bei jedem Aufruf
 * neu geladen und neu optimiert. Bei zwölf Bildern auf der Startseite ist das
 * der Unterschied zwischen schnell und zäh.
 *
 * Bewusst nur im Arbeitsspeicher des Prozesses: bei einem Neustart oder einer
 * zweiten Instanz wird neu signiert, was lediglich einen Cache-Fehlschlag
 * kostet. Ein geteilter Speicher wäre ein Betriebsteil mehr für einen Gewinn,
 * den ein warmer Prozess ohnehin bringt.
 */
const signaturCache = new Map<string, { url: string; gueltigBis: number }>();

/** Abgelaufene Einträge entfernen, damit die Map nicht endlos wächst. */
function aufraeumen(jetzt: number) {
  if (signaturCache.size < 2000) return;
  for (const [pfad, eintrag] of signaturCache) {
    if (eintrag.gueltigBis <= jetzt) signaturCache.delete(pfad);
  }
}

/** Eine einzelne Signed URL. null, wenn kein Pfad oder kein Zugriff. */
export async function getImageUrl(
  filePath: string | null | undefined,
): Promise<string | null> {
  if (!filePath) return null;
  const [url] = await getImageUrls([filePath]);
  return url ?? null;
}

/**
 * Mehrere Pfade in einem Request signieren – für Produktgrids deutlich
 * günstiger als ein Aufruf pro Bild. Signiert wird nur, was nicht schon im
 * Zwischenspeicher liegt.
 * Die Rückgabe hat dieselbe Reihenfolge wie die Eingabe; fehlgeschlagene
 * Pfade werden zu null.
 */
export async function getImageUrls(
  filePaths: (string | null | undefined)[],
): Promise<(string | null)[]> {
  const jetzt = Date.now();
  const valid = filePaths.filter((p): p is string => Boolean(p));
  if (valid.length === 0) return filePaths.map(() => null);

  const fehlend = [
    ...new Set(
      valid.filter((pfad) => {
        const eintrag = signaturCache.get(pfad);
        return !eintrag || eintrag.gueltigBis <= jetzt;
      }),
    ),
  ];

  if (fehlend.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .createSignedUrls(fehlend, SIGNED_URL_TTL);

    if (error) {
      console.error("[storage] Signed URLs fehlgeschlagen:", error.message);
    } else {
      for (const entry of data) {
        if (entry.signedUrl) {
          signaturCache.set(entry.path as string, {
            url: entry.signedUrl,
            gueltigBis: jetzt + CACHE_TTL_MS,
          });
        }
      }
      aufraeumen(jetzt);
    }
  }

  return filePaths.map((pfad) => {
    if (!pfad) return null;
    const eintrag = signaturCache.get(pfad);
    return eintrag && eintrag.gueltigBis > jetzt ? eintrag.url : null;
  });
}

/**
 * Signed URL fürs Rechnungs-PDF. Gleiches Prinzip wie getImageUrl: der
 * Bucket `invoices` ist privat, die RLS-Policy `invoices read own` regelt,
 * wer welchen Pfad sehen darf (eigene Bestellung oder Admin).
 */
export async function getInvoiceUrl(
  filePath: string | null | undefined,
): Promise<string | null> {
  if (!filePath) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL);

  if (error) {
    console.error("[storage] Rechnungs-URL fehlgeschlagen:", error.message);
    return null;
  }

  return data.signedUrl;
}
