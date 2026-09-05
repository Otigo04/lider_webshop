/**
 * Wann gilt ein Artikel als „neu"?
 *
 * Zwei Wege führen dahin, und beide sollen gelten:
 *   - der Admin setzt das Flag `is_new` von Hand (Aktionsware, Wiederauflage)
 *   - der Artikel wurde gerade erst aufgenommen
 *
 * Der zweite Weg ist der wichtigere: frisch eingepflegte Ware trägt das Label
 * automatisch und verliert es nach drei Tagen wieder, ohne dass jemand daran
 * denken muss. Ein Label, das niemand zurücksetzt, steht sonst nach einem
 * halben Jahr immer noch am Artikel und heißt dann gar nichts mehr.
 */

/** So lange nach der Aufnahme trägt ein Artikel automatisch das Neu-Label. */
export const NEU_TAGE = 3;

const TAG_IN_MS = 24 * 60 * 60 * 1000;

/** true, solange der Artikel jünger als NEU_TAGE ist. */
export function istFrischAufgenommen(
  createdAt: string | Date | null | undefined,
  jetzt: Date = new Date(),
): boolean {
  if (!createdAt) return false;
  const angelegt =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (Number.isNaN(angelegt.getTime())) return false;

  const alter = jetzt.getTime() - angelegt.getTime();
  return alter >= 0 && alter < NEU_TAGE * TAG_IN_MS;
}

/** Flag oder Aufnahmedatum – die Anzeige unterscheidet die beiden nicht. */
export function istNeu(
  product: { is_new?: boolean; created_at?: string | null },
  jetzt: Date = new Date(),
): boolean {
  return Boolean(product.is_new) || istFrischAufgenommen(product.created_at, jetzt);
}
