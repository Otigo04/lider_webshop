/**
 * Merkliste – Artikel, die sich ein Besucher vormerkt.
 *
 * Gespeichert im Cookie und nicht im localStorage wie der Warenkorb: die
 * Seite /merkliste rendert der Server, und der kann nur den Cookie lesen.
 * Nur Artikelkennungen, keine Namen oder Bilder – die kommen beim Anzeigen
 * frisch aus dem Katalog. Ein gemerkter Artikel, der inzwischen ausgelistet
 * ist, fällt damit von selbst heraus, statt als veraltete Kopie stehen zu
 * bleiben.
 *
 * Kein Datenbankeintrag: merken können auch Besucher ohne Konto, und eine
 * Merkliste ist eine Notiz, keine Bestellung. Der Preis dafür: sie gilt je
 * Gerät.
 *
 * Ohne Server-Importe – der Herz-Knopf (Client) und die Seite (Server)
 * lesen denselben Cookie nach denselben Regeln.
 */

export const MERKLISTE_COOKIE = "lider_merkliste";

/**
 * Obergrenze der Einträge. Ein Cookie trägt etwa 4 KB, eine Kennung 36
 * Zeichen plus Trenner – bei 100 bleibt Luft, und eine längere Merkliste
 * wäre ohnehin das Sortiment.
 */
export const MERKLISTE_MAX = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cookie-Wert → Kennungen. Unbrauchbares fällt still heraus. */
export function parseMerkliste(wert: string | null | undefined): string[] {
  if (!wert) return [];
  let text = wert;
  try {
    text = decodeURIComponent(wert);
  } catch {
    // Kaputt kodierter Wert: roh weiter, der UUID-Test siebt aus.
  }
  const ids = text.split(".").filter((id) => UUID.test(id));
  return [...new Set(ids)].slice(0, MERKLISTE_MAX);
}

/** Kennungen → Cookie-Wert. Punkt als Trenner, er braucht keine Kodierung. */
export function serializeMerkliste(ids: string[]): string {
  return ids.slice(0, MERKLISTE_MAX).join(".");
}
