/**
 * Öffnungszeiten des Ladens (company_settings.opening_hours, Migration 071).
 *
 * Reine Funktionen ohne Server-Importe: Checkout (Browser), Kontaktseite und
 * Admin-Formular rechnen mit denselben Regeln wie der Trigger
 * orders_abholzeit_pruefen() in der Datenbank – Index 0 ist Montag, Zeiten
 * gelten in Europe/Berlin, Öffnung und Schluss inklusive.
 */

export interface Zeitfenster {
  open: string;
  close: string;
}

/** Sieben Einträge, 0 = Montag … 6 = Sonntag; null = geschlossen. */
export type Oeffnungszeiten = (Zeitfenster | null)[];

export const WOCHENTAGE = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

const SCHEMA_TAGE = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const LADEN_ZEITZONE = "Europe/Berlin";

export const STANDARD_OEFFNUNGSZEITEN: Oeffnungszeiten = [
  { open: "11:00", close: "18:30" },
  null,
  { open: "11:00", close: "18:30" },
  { open: "11:00", close: "18:30" },
  { open: "11:00", close: "18:30" },
  { open: "11:00", close: "19:00" },
  { open: "11:00", close: "19:00" },
];

const ZEIT = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minuten(zeit: string): number {
  const m = ZEIT.exec(zeit);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function gueltigesFenster(wert: unknown): Zeitfenster | null {
  if (!wert || typeof wert !== "object") return null;
  const { open, close } = wert as Record<string, unknown>;
  if (typeof open !== "string" || typeof close !== "string") return null;
  if (!ZEIT.test(open) || !ZEIT.test(close)) return null;
  if (minuten(open) >= minuten(close)) return null;
  return { open, close };
}

/**
 * JSON aus der Datenbank → sieben Einträge. Ein kaputter Gesamtwert (kein
 * Array mit sieben Einträgen) fällt auf die Vorbelegung zurück; ein einzelner
 * kaputter Tag gilt als geschlossen – lieber zu wenig versprochen als ein
 * Zeitfenster erfunden.
 */
export function parseOeffnungszeiten(roh: unknown): Oeffnungszeiten {
  if (!Array.isArray(roh) || roh.length !== 7) {
    return STANDARD_OEFFNUNGSZEITEN.map((tag) => (tag ? { ...tag } : null));
  }
  return roh.map((tag) => gueltigesFenster(tag));
}

function berlinTeile(zeitpunkt: Date, zone: string): { tag: number; minuten: number } {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(zeitpunkt)
      .map((teil) => [teil.type, teil.value]),
  );
  const tag = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(teile.weekday);
  return { tag, minuten: Number(teile.hour) * 60 + Number(teile.minute) };
}

/** Liegt der Zeitpunkt innerhalb der Öffnungszeiten? Öffnung und Schluss zählen mit. */
export function istGeoeffnet(
  zeitpunkt: Date,
  zeiten: Oeffnungszeiten,
  zone: string = LADEN_ZEITZONE,
): boolean {
  if (Number.isNaN(zeitpunkt.getTime())) return false;
  const { tag, minuten: m } = berlinTeile(zeitpunkt, zone);
  const fenster = zeiten[tag];
  if (!fenster) return false;
  return m >= minuten(fenster.open) && m <= minuten(fenster.close);
}

/** Tage als „Mo, Mi–Fr": Läufe ab drei Tagen mit Strich, sonst mit Komma. */
function tageText(tage: number[]): string {
  const laeufe: number[][] = [];
  for (const tag of tage) {
    const letzter = laeufe.at(-1);
    if (letzter && letzter.at(-1) === tag - 1) letzter.push(tag);
    else laeufe.push([tag]);
  }
  return laeufe
    .map((lauf) =>
      lauf.length >= 3
        ? `${WOCHENTAGE_KURZ[lauf[0]]}–${WOCHENTAGE_KURZ[lauf.at(-1)!]}`
        : lauf.map((t) => WOCHENTAGE_KURZ[t]).join(", "),
    )
    .join(", ");
}

/** Anzeigezeilen, gleiche Zeiten zusammengefasst, Reihenfolge nach erstem Tag. */
export function formatOeffnungszeiten(zeiten: Oeffnungszeiten): string[] {
  const gruppen = new Map<string, number[]>();
  zeiten.forEach((fenster, tag) => {
    const schluessel = fenster ? `${fenster.open}–${fenster.close}` : "zu";
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), tag]);
  });
  return [...gruppen.entries()].map(([schluessel, tage]) =>
    schluessel === "zu"
      ? `${tageText(tage)} geschlossen`
      : `${tageText(tage)} ${schluessel} Uhr`,
  );
}

/** schema.org-Angabe für die Startseite (components/structured-data.tsx). */
export function openingHoursSpecification(zeiten: Oeffnungszeiten): {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}[] {
  const gruppen = new Map<string, number[]>();
  zeiten.forEach((fenster, tag) => {
    if (!fenster) return;
    const schluessel = `${fenster.open}|${fenster.close}`;
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), tag]);
  });
  return [...gruppen.entries()].map(([schluessel, tage]) => {
    const [opens, closes] = schluessel.split("|");
    return {
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: tage.map((t) => SCHEMA_TAGE[t]),
      opens,
      closes,
    };
  });
}
