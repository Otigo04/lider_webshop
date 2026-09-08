/**
 * Zeiträume der Umsatzübersicht.
 *
 * Gerechnet wird auf Kassentagen (YYYY-MM-DD in Ladenzeit), nicht auf
 * Zeitstempeln: ein Kassentag endet mit dem Ladenschluss, und wer „diesen
 * Monat" sagt, meint die Tage, unter denen die Bons verbucht sind – nicht ein
 * UTC-Fenster, das den Abend des Letzten in den Folgemonat schiebt.
 *
 * Der Bezugstag kommt immer von außen (pos_heute() aus der Datenbank). Die
 * Anwendung zieht keine eigenen Tagesgrenzen.
 */

export const ZEITRAUM_PRESETS = [
  "heute",
  "gestern",
  "woche",
  "monat",
  "vormonat",
  "jahr",
  "alles",
] as const;

export type ZeitraumPreset = (typeof ZEITRAUM_PRESETS)[number];

export const ZEITRAUM_LABELS: Record<ZeitraumPreset, string> = {
  heute: "Heute",
  gestern: "Gestern",
  woche: "Diese Woche",
  monat: "Dieser Monat",
  vormonat: "Vormonat",
  jahr: "Dieses Jahr",
  alles: "Alles",
};

/**
 * Untergrenze für „Alles". Ein Datum statt einer zweiten Abfrage nach dem
 * ersten Beleg: die Kasse gibt es seit 2025, und pos_day_totals gruppiert
 * ohnehin nur über vorhandene Bons.
 */
const ANFANG = "2000-01-01";

export interface Zeitraum {
  von: string;
  bis: string;
  /** null, wenn von Hand ein Datum eingegeben wurde */
  preset: ZeitraumPreset | null;
}

export function istPreset(wert: unknown): wert is ZeitraumPreset {
  return (
    typeof wert === "string" &&
    (ZEITRAUM_PRESETS as readonly string[]).includes(wert)
  );
}

export function istTag(wert: unknown): wert is string {
  return typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert);
}

/** Kassentag als lokales Datum – „2026-09-08" darf nicht als UTC gelesen werden. */
export function alsDatum(tag: string): Date {
  const [jahr, monat, tagImMonat] = tag.split("-").map(Number);
  return new Date(jahr, monat - 1, tagImMonat);
}

export function alsTag(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(
    datum.getDate(),
  ).padStart(2, "0")}`;
}

function verschoben(tag: string, tage: number): string {
  const datum = alsDatum(tag);
  datum.setDate(datum.getDate() + tage);
  return alsTag(datum);
}

/** Preset in konkrete Grenzen auflösen. `heute` ist der Kassentag aus der DB. */
export function grenzen(preset: ZeitraumPreset, heute: string): Zeitraum {
  const datum = alsDatum(heute);

  switch (preset) {
    case "heute":
      return { von: heute, bis: heute, preset };

    case "gestern": {
      const gestern = verschoben(heute, -1);
      return { von: gestern, bis: gestern, preset };
    }

    case "woche": {
      // Die Woche beginnt am Montag. getDay() zählt Sonntag als 0 – der
      // gehört hier ans Ende der Woche, nicht an ihren Anfang.
      const wochentag = (datum.getDay() + 6) % 7;
      return { von: verschoben(heute, -wochentag), bis: heute, preset };
    }

    case "monat":
      return { von: `${heute.slice(0, 7)}-01`, bis: heute, preset };

    case "vormonat": {
      const erster = new Date(datum.getFullYear(), datum.getMonth() - 1, 1);
      const letzter = new Date(datum.getFullYear(), datum.getMonth(), 0);
      return { von: alsTag(erster), bis: alsTag(letzter), preset };
    }

    case "jahr":
      return { von: `${heute.slice(0, 4)}-01-01`, bis: heute, preset };

    case "alles":
      return { von: ANFANG, bis: heute, preset };
  }
}

/**
 * Zeitraum aus der Adresszeile lesen. Eigene Daten schlagen das Preset –
 * wer von Hand ein Datum einträgt, meint es auch.
 */
export function zeitraumAusParams(
  params: Record<string, string | string[] | undefined>,
  heute: string,
): Zeitraum {
  const von = istTag(params.von) ? params.von : null;
  const bis = istTag(params.bis) ? params.bis : null;

  if (von || bis) {
    const anfang = von ?? ANFANG;
    const ende = bis ?? heute;
    // Verdrehte Eingaben nicht ablehnen, sondern drehen: ein leerer Bericht
    // ohne Erklärung wäre die schlechtere Antwort.
    return anfang <= ende
      ? { von: anfang, bis: ende, preset: null }
      : { von: ende, bis: anfang, preset: null };
  }

  return grenzen(istPreset(params.zeitraum) ? params.zeitraum : "monat", heute);
}

/** Adresszeile für einen Reiter der Zeitraumleiste. */
export function zeitraumLink(
  pfad: string,
  preset: ZeitraumPreset,
  gruppe: "tag" | "monat",
): string {
  return `${pfad}?zeitraum=${preset}&gruppe=${gruppe}`;
}
