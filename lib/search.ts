import "server-only";

/**
 * Wortweise statt phrasenweise suchen.
 *
 * "alpalium 16er" fand bisher nichts, weil der ganze Suchbegriff als
 * zusammenhängende Phrase gegen Name/SKU/Barcode geprüft wurde – der Artikel
 * heißt aber "ALPALIUM Super Heavy Duty R03/AAA, 16er Blister". Die beiden
 * Wörter stehen nicht nebeneinander, also stand "alpalium 16er" nie als
 * Teilstring im Namen, obwohl beide Wörter längst drinstehen.
 *
 * Jedes Wort bekommt eine eigene `.or()`-Bedingung statt einer einzigen für
 * den ganzen Begriff. PostgREST (und damit supabase-js) UND-verknüpft
 * mehrere `.or()`-Aufrufe auf derselben Abfrage automatisch – innerhalb eines
 * Aufrufs bleibt es ODER. Ergebnis: jedes Wort muss irgendwo in einer der
 * angegebenen Spalten stehen, in beliebiger Reihenfolge, aber alle Wörter
 * müssen treffen.
 *
 * Gilt für jede Suche im Artikelstamm gleich – Admin-Liste, Wareneingang,
 * Kasse, Preisschilder, Shop – damit nicht an einer Stelle wortweise gesucht
 * wird und an der nächsten wieder phrasenweise.
 */
export function sucheWortweise<Q extends { or(filter: string): Q }>(
  query: Q,
  spalten: readonly string[],
  begriff: string,
): Q {
  const woerter = begriff.trim().split(/\s+/).filter(Boolean);
  return woerter.reduce(
    (q, wort) => q.or(spalten.map((spalte) => `${spalte}.ilike.%${wort}%`).join(",")),
    query,
  );
}
