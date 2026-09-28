/**
 * Impressum aus den Einstellungen (Migration 045).
 *
 * Das Impressum ist eine Liste von Abschnitten, gepflegt unter
 * /admin/settings. Im Text stehen Platzhalter wie {firma}, die beim Anzeigen
 * aus den Firmendaten gefüllt werden: eine neue Anschrift wird dann nur einmal
 * eingetragen und stimmt auf Rechnung, Fußzeile und Impressum zugleich.
 *
 * Ohne Browser- oder Serverabhängigkeit – die Einstellungsseite zeigt dieselbe
 * Vorlage und dieselbe Platzhalterliste wie die Seite selbst.
 */

export interface ImpressumAbschnitt {
  titel: string;
  text: string;
}

/** Firmendaten, aus denen die Platzhalter gefüllt werden. */
export interface ImpressumDaten {
  company_name: string | null;
  owner_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  vat_id: string | null;
  register_court: string | null;
  register_number: string | null;
}

/** Obergrenzen – gleich in Formular und Server Action. */
export const IMPRESSUM_MAX_ABSCHNITTE = 30;
export const IMPRESSUM_MAX_TITEL = 160;
export const IMPRESSUM_MAX_TEXT = 4000;

/**
 * Platzhalter mit Beschriftung. Fehlt der Wert, steht die Beschriftung in
 * eckigen Klammern da – wie überall, wo Firmendaten noch nicht gepflegt sind.
 * Eine leere Stelle fiele im Impressum nicht auf, ein „[Registergericht]"
 * schon.
 */
export const IMPRESSUM_PLATZHALTER: {
  schluessel: string;
  label: string;
  wert: (d: ImpressumDaten) => string | null;
}[] = [
  { schluessel: "firma", label: "Firmenname", wert: (d) => d.company_name },
  { schluessel: "inhaber", label: "Inhaber", wert: (d) => d.owner_name },
  { schluessel: "strasse", label: "Straße", wert: (d) => d.address_street },
  { schluessel: "plz", label: "PLZ", wert: (d) => d.address_zip },
  { schluessel: "ort", label: "Ort", wert: (d) => d.address_city },
  { schluessel: "land", label: "Land", wert: (d) => d.address_country },
  {
    schluessel: "anschrift",
    label: "Anschrift",
    wert: (d) => {
      const ortZeile = [d.address_zip, d.address_city].filter(Boolean).join(" ");
      const zeilen = [d.address_street, ortZeile].filter(Boolean);
      return zeilen.length ? zeilen.join("\n") : null;
    },
  },
  { schluessel: "telefon", label: "Telefon", wert: (d) => d.phone },
  { schluessel: "email", label: "E-Mail", wert: (d) => d.email },
  { schluessel: "webseite", label: "Webseite", wert: (d) => d.website },
  { schluessel: "ustid", label: "USt-IdNr.", wert: (d) => d.vat_id },
  {
    schluessel: "registergericht",
    label: "Registergericht",
    wert: (d) => d.register_court,
  },
  {
    schluessel: "registernummer",
    label: "Registernummer",
    wert: (d) => d.register_number,
  },
];

/**
 * Vorlage, solange nichts gepflegt ist – der Aufbau, der vorher fest im
 * Quelltext stand. „Übernehmen" in den Einstellungen legt sie als
 * Ausgangspunkt ab.
 */
export const IMPRESSUM_VORLAGE: ImpressumAbschnitt[] = [
  { titel: "Angaben gemäß § 5 DDG", text: "{firma}\n{anschrift}" },
  { titel: "Vertreten durch", text: "{inhaber}" },
  { titel: "Kontakt", text: "Telefon: {telefon}\nE-Mail: {email}" },
  {
    titel: "Registereintrag",
    text: "Registergericht: {registergericht}\nRegisternummer: {registernummer}",
  },
  {
    titel: "Umsatzsteuer-Identifikationsnummer",
    text: "gemäß § 27 a UStG: {ustid}",
  },
];

/**
 * Gespeicherten Wert lesen. null heißt „nie gepflegt" und führt zur Vorlage;
 * eine leere Liste ist dagegen eine Entscheidung und bleibt leer. Kaputte
 * Einträge fallen still heraus statt die Seite scheitern zu lassen.
 */
export function leseImpressum(roh: unknown): ImpressumAbschnitt[] | null {
  if (!Array.isArray(roh)) return null;
  return roh
    .filter(
      (eintrag): eintrag is ImpressumAbschnitt =>
        typeof eintrag === "object" &&
        eintrag !== null &&
        typeof (eintrag as ImpressumAbschnitt).titel === "string" &&
        typeof (eintrag as ImpressumAbschnitt).text === "string",
    )
    .map(({ titel, text }) => ({ titel, text }));
}

/** Platzhalter im Text durch Firmendaten ersetzen. Unbekannte bleiben stehen. */
export function fuelleImpressum(text: string, daten: ImpressumDaten): string {
  return text.replace(/\{([a-z]+)\}/g, (roh, schluessel: string) => {
    const platzhalter = IMPRESSUM_PLATZHALTER.find(
      (p) => p.schluessel === schluessel,
    );
    if (!platzhalter) return roh;
    const wert = platzhalter.wert(daten)?.trim();
    return wert ? wert : `[${platzhalter.label}]`;
  });
}
