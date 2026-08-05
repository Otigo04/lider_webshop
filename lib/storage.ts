import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Der Bucket `products` ist privat. Produktfotos sind deshalb nur über
 * kurzlebige Signed URLs erreichbar, die hier serverseitig erzeugt werden.
 * Ein Kunde ohne gültige Session bekommt keine URL – die Storage-Policy
 * prüft `is_active_user()`.
 */

export const PRODUCT_BUCKET = "products";

/** Gültigkeit der Signed URLs in Sekunden. Deckt eine übliche Sitzung ab. */
const SIGNED_URL_TTL = 60 * 60;

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
 * günstiger als ein Aufruf pro Bild.
 * Die Rückgabe hat dieselbe Reihenfolge wie die Eingabe; fehlgeschlagene
 * Pfade werden zu null.
 */
export async function getImageUrls(
  filePaths: (string | null | undefined)[],
): Promise<(string | null)[]> {
  const valid = filePaths.filter((p): p is string => Boolean(p));
  if (valid.length === 0) return filePaths.map(() => null);

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .createSignedUrls(valid, SIGNED_URL_TTL);

  if (error) {
    console.error("[storage] Signed URLs fehlgeschlagen:", error.message);
    return filePaths.map(() => null);
  }

  const byPath = new Map(
    data.map((entry) => [entry.path, entry.signedUrl ?? null]),
  );
  return filePaths.map((p) => (p ? (byPath.get(p) ?? null) : null));
}
