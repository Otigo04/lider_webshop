/**
 * Zahlungsvermerk auf der Rechnung: wie wurde bezahlt, oder wann ist zu
 * zahlen. Die Auswahl im Rechnungsformular liefert einen Schlüssel; daraus
 * wird hier der Text, der in `invoices.payment_note` festgeschrieben wird
 * (Migration 074). `null` bedeutet „Auf Rechnung" mit dem Zahlungsziel aus
 * den Firmendaten – das setzt das PDF selbst.
 */
export const ZAHLUNGSVERMERK_OPTIONEN = [
  { key: "ziel", label: "Auf Rechnung (Zahlungsziel)" },
  { key: "bar", label: "Bar bezahlt" },
  { key: "ueberwiesen", label: "Per Überweisung bezahlt" },
  { key: "karte", label: "Per Karte bezahlt" },
  { key: "vorkasse", label: "Vorkasse (vor Lieferung überweisen)" },
  { key: "frei", label: "Freie Eingabe …" },
] as const;

export type ZahlungsvermerkKey = (typeof ZAHLUNGSVERMERK_OPTIONEN)[number]["key"];

const TEXTE: Record<Exclude<ZahlungsvermerkKey, "ziel" | "frei">, string> = {
  bar: "Betrag bar bezahlt. Vielen Dank für Ihren Einkauf.",
  ueberwiesen: "Betrag per Überweisung bezahlt. Vielen Dank für Ihren Einkauf.",
  karte: "Betrag per Karte bezahlt. Vielen Dank für Ihren Einkauf.",
  vorkasse:
    "Zahlbar vor Lieferung per Überweisung (Vorkasse). Die Ware wird nach Zahlungseingang versendet bzw. bereitgestellt.",
};

export function isZahlungsvermerkKey(wert: unknown): wert is ZahlungsvermerkKey {
  return ZAHLUNGSVERMERK_OPTIONEN.some((option) => option.key === wert);
}

/** Text für die Rechnung; null = Standard (Zahlungsziel). */
export function zahlungsvermerkText(
  key: ZahlungsvermerkKey,
  frei: string | null | undefined,
): string | null {
  if (key === "ziel") return null;
  if (key === "frei") return frei?.trim() || null;
  return TEXTE[key];
}
