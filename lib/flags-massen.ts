/*
 * Flags für mehrere Artikel auf einmal (Artikelliste, Leiste unten). Reine
 * Rechenstelle: aus der Auswahl in der Oberfläche wird hier das, was in
 * `products` und `product_flag_links` geschrieben wird. Server Action und
 * Oberfläche rufen dieselbe Funktion – die Vorschau zählt, was später gilt.
 */

export const FESTE_FLAGS = ["is_new", "is_topseller", "is_restposten", "is_preorder"] as const;
export type FesterFlag = (typeof FESTE_FLAGS)[number];

export const FESTE_FLAG_LABELS: Record<FesterFlag, string> = {
  is_new: "Neuheit",
  is_topseller: "Topseller",
  is_restposten: "Restposten",
  is_preorder: "Vorbestellbar",
};

/** Was mit einem Flag passiert: nichts, setzen, entfernen. */
export type FlagWahl = "" | "an" | "aus";

export interface FlagsAenderung {
  /** Feste Flags; fehlt ein Schlüssel, bleibt das Flag unverändert */
  fest: Partial<Record<FesterFlag, boolean>>;
  /** Eigene Flags aus den Einstellungen, nach ID */
  eigene: Record<string, boolean>;
  /** Güteklasse Restposten: A/B setzen, "" löschen, undefined unverändert */
  ware?: "A" | "B" | "";
}

/** Die Auswahl der Oberfläche (je Flag leer/an/aus) als Änderung. */
export function aenderungAusWahl(
  fest: Partial<Record<FesterFlag, FlagWahl>>,
  eigene: Record<string, FlagWahl>,
  ware: "" | "A" | "B" | "loeschen",
): FlagsAenderung {
  const a: FlagsAenderung = { fest: {}, eigene: {} };
  for (const flag of FESTE_FLAGS) {
    const wahl = fest[flag];
    if (wahl === "an") a.fest[flag] = true;
    if (wahl === "aus") a.fest[flag] = false;
  }
  for (const [id, wahl] of Object.entries(eigene)) {
    if (wahl === "an") a.eigene[id] = true;
    if (wahl === "aus") a.eigene[id] = false;
  }
  if (ware === "A" || ware === "B") a.ware = ware;
  if (ware === "loeschen") a.ware = "";
  return a;
}

export function hatAenderung(a: FlagsAenderung): boolean {
  return (
    Object.keys(a.fest).length > 0 || Object.keys(a.eigene).length > 0 || a.ware !== undefined
  );
}

/**
 * Spalten für `products`, oder ein Fehlertext. Dieselben Regeln wie beim
 * einzelnen Artikel: eine Güteklasse setzt das Restposten-Flag mit, und wer
 * Restposten entfernt, verliert die Klasse (Migration 070).
 */
export function produktSpalten(
  a: FlagsAenderung,
): { spalten: Record<string, boolean | string | null> } | { fehler: string } {
  const spalten: Record<string, boolean | string | null> = {};
  for (const flag of FESTE_FLAGS) {
    const wert = a.fest[flag];
    if (wert !== undefined) spalten[flag] = wert;
  }

  if (a.ware === "A" || a.ware === "B") {
    if (a.fest.is_restposten === false) {
      return { fehler: "Restposten entfernen und zugleich eine Güteklasse setzen passt nicht zusammen." };
    }
    spalten.restposten_ware = a.ware;
    spalten.is_restposten = true;
  } else if (a.ware === "") {
    spalten.restposten_ware = null;
  } else if (a.fest.is_restposten === false) {
    spalten.restposten_ware = null;
  }
  return { spalten };
}

/** „Neuheit setzen, Topseller entfernen, Güteklasse A" – für Bestätigung und Meldung. */
export function aenderungText(a: FlagsAenderung, eigeneNamen: Record<string, string>): string {
  const teile: string[] = [];
  for (const flag of FESTE_FLAGS) {
    const wert = a.fest[flag];
    if (wert !== undefined) teile.push(`${FESTE_FLAG_LABELS[flag]} ${wert ? "setzen" : "entfernen"}`);
  }
  for (const [id, wert] of Object.entries(a.eigene)) {
    teile.push(`${eigeneNamen[id] ?? "Flag"} ${wert ? "setzen" : "entfernen"}`);
  }
  if (a.ware === "A" || a.ware === "B") teile.push(`Güteklasse ${a.ware}-Ware`);
  if (a.ware === "") teile.push("Güteklasse löschen");
  return teile.join(", ");
}
