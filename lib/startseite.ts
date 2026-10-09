/**
 * Reihenfolge der Artikel auf der Startseite.
 *
 * Neues steht immer vorn – wer die Seite aufruft, will zuerst sehen, was
 * hereingekommen ist. Reine Funktionen, damit sich die Reihenfolge testen
 * lässt; die Abfrage in lib/queries/products.ts ruft sie nur auf.
 */

/** Neues nach vorn, sonst bleibt die Reihenfolge, wie sie ist (stabil). */
export function neuZuerst<T>(liste: T[], istNeu: (eintrag: T) => boolean): T[] {
  return [
    ...liste.filter((eintrag) => istNeu(eintrag)),
    ...liste.filter((eintrag) => !istNeu(eintrag)),
  ];
}

/**
 * Querschnitt durchs Sortiment: erst alles Neue (in der Reihenfolge der
 * Eingabe), danach reihum eine Warengruppe nach der anderen, damit die Auswahl
 * die Breite des Sortiments zeigt und nicht nur die Gruppe, in der zuletzt
 * eingepflegt wurde. Höchstens `max` Einträge, keiner doppelt.
 */
export function querschnitt<T extends { category_id: string }>(
  liste: T[],
  istNeu: (eintrag: T) => boolean,
  max: number,
): T[] {
  const ergebnis = liste.filter((eintrag) => istNeu(eintrag)).slice(0, max);

  const nachGruppe = new Map<string, T[]>();
  for (const eintrag of liste) {
    if (istNeu(eintrag)) continue;
    const gruppe = nachGruppe.get(eintrag.category_id) ?? [];
    gruppe.push(eintrag);
    nachGruppe.set(eintrag.category_id, gruppe);
  }

  for (let runde = 0; ergebnis.length < max; runde += 1) {
    let nachgelegt = false;
    for (const gruppe of nachGruppe.values()) {
      if (gruppe.length <= runde) continue;
      ergebnis.push(gruppe[runde]);
      nachgelegt = true;
      if (ergebnis.length >= max) break;
    }
    if (!nachgelegt) break;
  }
  return ergebnis;
}
