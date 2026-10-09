/**
 * Fotos in der Artikelliste: reine Hilfen für Upload und Anzeige.
 *
 * Getrennt von der Server Action, damit sich die Regeln testen lassen, ohne
 * Datenbank: wohin neue Fotos in der Reihenfolge kommen, welches Foto die
 * Vorschau ist und welche Pfade ein Artikel überhaupt anhängen darf.
 */

/**
 * Reihenfolge für `anzahl` neue Fotos: hinter dem höchsten vorhandenen Wert.
 * Lücken bleiben – ein gelöschtes Foto 1 von 0,1,2 verschiebt nichts.
 */
export function naechsteReihenfolge(
  vorhanden: number[],
  anzahl: number,
): number[] {
  const start = vorhanden.length === 0 ? 0 : Math.max(...vorhanden) + 1;
  return Array.from({ length: anzahl }, (_, i) => start + i);
}

/** Pfad des ersten Fotos (kleinste Reihenfolge) – die Vorschau in der Liste. */
export function ersterBildPfad(
  images: { file_path: string; display_order: number }[] | null | undefined,
): string | null {
  if (!images || images.length === 0) return null;
  return [...images].sort((a, b) => a.display_order - b.display_order)[0]
    .file_path;
}

/**
 * Jeder Pfad muss `<artikel-id>/<datei>` sein. Der Browser lädt selbst in den
 * Bucket und meldet dann nur Pfade zurück; ohne diese Prüfung ließe sich ein
 * Foto eines anderen Artikels (oder `../`) an diesen hängen.
 */
export function pruefeBildpfade(artikelId: string, pfade: string[]): boolean {
  if (pfade.length === 0) return false;
  return pfade.every((pfad) => {
    if (!pfad.startsWith(`${artikelId}/`)) return false;
    const datei = pfad.slice(artikelId.length + 1);
    return datei.length > 0 && !datei.includes("/") && !datei.includes("..");
  });
}
