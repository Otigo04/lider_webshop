/**
 * Deterministische Akzentfarbe aus einem Text (Kategorie, Firmenname o. Ä.).
 *
 * Kein Zufall, keine Konfiguration pro Kategorie nötig: derselbe Schlüssel
 * ergibt immer dieselbe Farbe, neue Kategorien bekommen automatisch eine.
 * Die Palette steht in app/globals.css (.tag-1 … .tag-6).
 */
export function accentIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (hash % 6) + 1;
}
