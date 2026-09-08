import type { ProductAttributeGroup, ProductAttributeValue } from "@/lib/types";

/**
 * Artikelgruppen (Migration 033) – die Rechenarbeit ohne Datenbank und ohne
 * React, damit Sortiment und Artikelseite dieselbe Antwort geben.
 *
 * Eine Ausführung ist ein ganz normaler Artikel; die Gruppe sagt nur, dass
 * mehrere davon **ein** Angebot sind. Zwei Fragen fallen daraus an:
 *
 *   1. Im Sortiment: welche der vier Lampen steht in der Liste? (`gruppiere`)
 *   2. Auf der Artikelseite: wohin führt der Klick auf „100 W"? (`zielVariante`)
 */

/** Das Mindeste, was ein Eintrag mitbringen muss, um bündelbar zu sein. */
export interface Buendelbar {
  id: string;
  group_id: string | null;
}

/** Eine Kachel im Sortiment, nachdem die Gruppe zusammengefaltet wurde. */
export type Gebuendelt<T> = T & {
  /**
   * Ausführungen, die diese Kachel vertritt. 1 = einzelner Artikel; erst ab 2
   * ist es ein Bündel und die Karte zeigt „3 Ausführungen".
   */
  ausfuehrungen: number;
};

/**
 * Faltet Ausführungen derselben Gruppe zu einer Kachel zusammen.
 *
 * **Behalten wird die erste** – nicht die billigste, nicht die mit dem meisten
 * Bestand. Der Grund: die Liste ist an dieser Stelle schon gefiltert und
 * sortiert (lib/shop-filters.ts). Wer nach Preis aufsteigend sortiert, bekommt
 * damit von allein die günstigste Ausführung als Vertreter; wer nach Namen
 * sortiert, die alphabetisch erste. Eine eigene Regel hier würde der
 * gewählten Sortierung widersprechen und die Reihenfolge zerreißen.
 *
 * Gezählt wird ebenfalls nur, was den Filter überstanden hat: hakt jemand
 * „rot" an, soll dort „2 Ausführungen" stehen und nicht „6" – gemeint sind
 * die roten.
 *
 * Artikel ohne Gruppe gehen unverändert durch. Sie sind der Normalfall.
 */
export function gruppiere<T extends Buendelbar>(items: T[]): Gebuendelt<T>[] {
  const zaehler = new Map<string, number>();
  for (const item of items) {
    if (!item.group_id) continue;
    zaehler.set(item.group_id, (zaehler.get(item.group_id) ?? 0) + 1);
  }

  const gesehen = new Set<string>();
  const ergebnis: Gebuendelt<T>[] = [];

  for (const item of items) {
    if (!item.group_id) {
      ergebnis.push({ ...item, ausfuehrungen: 1 });
      continue;
    }
    if (gesehen.has(item.group_id)) continue;
    gesehen.add(item.group_id);
    ergebnis.push({ ...item, ausfuehrungen: zaehler.get(item.group_id) ?? 1 });
  }

  return ergebnis;
}

// --- Auswahlfelder der Artikelseite ------------------------------------------

/** Eine Ausführung, so wie der Auswahlblock sie braucht. */
export interface Ausfuehrung {
  id: string;
  name: string;
  /** Merkmalswerte dieser Ausführung – „rot", „60 W" */
  valueIds: string[];
  /** Frei verfügbar; null, wenn Bestände in dieser Ansicht nicht vorliegen */
  freeStock: number | null;
}

/** Ein Wert im Auswahlfeld, fertig für die Darstellung. */
export interface AuswahlWert {
  wert: ProductAttributeValue;
  /** Diese Ausführung wird gerade angezeigt */
  aktiv: boolean;
  /**
   * Artikel-ID, zu der der Klick führt. null = mit den übrigen Einstellungen
   * gibt es diese Kombination gar nicht.
   */
  zielId: string | null;
  /** Es gibt sie, aber nichts davon ist frei verfügbar */
  ausverkauft: boolean;
}

export interface Auswahlfeld {
  attribut: ProductAttributeGroup;
  werte: AuswahlWert[];
}

/**
 * Merkmalswert einer Ausführung für ein bestimmtes Merkmal.
 *
 * Bewusst nur der erste: die Zuordnungstabelle erlaubt mehrere Werte je
 * Merkmal (ein Karton kann „rot und blau" sein), als Kaufauswahl ergäbe das
 * aber keinen Sinn – man wählt eine Farbe, nicht zwei.
 */
function wertVon(
  ausfuehrung: Ausfuehrung,
  attribut: ProductAttributeGroup,
): string | null {
  for (const wert of attribut.values) {
    if (ausfuehrung.valueIds.includes(wert.id)) return wert.id;
  }
  return null;
}

/**
 * Baut die Auswahlfelder für die Artikelseite.
 *
 * Für jeden Wert wird gesucht, wohin der Klick führt: die Ausführung, die in
 * diesem Merkmal den geklickten Wert trägt und in **allen anderen** so bleibt,
 * wie sie gerade eingestellt ist. Wer bei „rot · 60 W" auf 100 W klickt, will
 * die rote 100-W-Lampe und nicht irgendeine.
 *
 * Gibt es die genaue Kombination nicht – rot in 100 W wurde nie geführt –,
 * führt der Klick ersatzweise auf irgendeine Ausführung mit dem geklickten
 * Wert. Das ist besser als ein toter Knopf: der Kunde sieht, dass es 100 W
 * gibt, und die Seite wechselt eben zusätzlich die Farbe. Nur wenn es den Wert
 * im ganzen Bündel nicht gibt, bleibt `zielId` leer.
 *
 * Merkmale, in denen sich nichts unterscheidet, fallen weg: sind alle vier
 * Lampen E27, ist ein Auswahlfeld mit einer einzigen Schaltfläche keine
 * Auswahl. Es steht dann als Angabe in der Merkmalsliste darunter.
 */
export function baueAuswahlfelder({
  attributes,
  ausfuehrungen,
  aktuelleId,
}: {
  attributes: ProductAttributeGroup[];
  ausfuehrungen: Ausfuehrung[];
  aktuelleId: string;
}): Auswahlfeld[] {
  const aktuell = ausfuehrungen.find((a) => a.id === aktuelleId);
  if (!aktuell || ausfuehrungen.length < 2) return [];

  const felder: Auswahlfeld[] = [];

  for (const attribut of attributes) {
    // Welche Werte dieses Merkmals kommen im Bündel überhaupt vor?
    const belegt = attribut.values.filter((wert) =>
      ausfuehrungen.some((a) => a.valueIds.includes(wert.id)),
    );
    if (belegt.length < 2) continue;

    const eigenerWert = wertVon(aktuell, attribut);

    const werte: AuswahlWert[] = belegt.map((wert) => {
      // Kandidaten: alle Ausführungen mit genau diesem Wert.
      const kandidaten = ausfuehrungen.filter((a) =>
        a.valueIds.includes(wert.id),
      );

      // Bevorzugt die, die in allen *anderen* Merkmalen so bleibt wie jetzt.
      const passend = kandidaten.filter((kandidat) =>
        attributes.every((anderes) => {
          if (anderes.id === attribut.id) return true;
          const jetzt = wertVon(aktuell, anderes);
          if (jetzt === null) return true;
          return wertVon(kandidat, anderes) === jetzt;
        }),
      );

      const auswahl = passend.length > 0 ? passend : kandidaten;
      // Unter mehreren gleich passenden die lieferbare – ein Klick, der auf
      // „ausverkauft" führt, obwohl daneben Ware liegt, ist ein Fehlgriff.
      const lieferbar = auswahl.find((a) => a.freeStock === null || a.freeStock > 0);
      const ziel = lieferbar ?? auswahl[0] ?? null;

      return {
        wert,
        aktiv: eigenerWert === wert.id,
        zielId: ziel?.id ?? null,
        ausverkauft:
          auswahl.length > 0 &&
          auswahl.every((a) => a.freeStock !== null && a.freeStock <= 0),
      };
    });

    felder.push({ attribut, werte });
  }

  return felder;
}
