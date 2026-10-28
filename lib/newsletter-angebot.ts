import { gutscheinWert, type GutscheinArt } from "@/lib/rabatt";

/*
 * Das Angebot hinter dem Newsletter-Gutschein (Migration 076), so wie es
 * Besucher sehen dürfen: Art, Wert, Bedingungen – nie der Code. Alle Texte auf
 * Startseite, Registrierung, Konto und in der Mail kommen von hier und aus dem
 * Gutschein selbst, nichts davon steht fest im Quelltext. Ändert der Betreiber
 * den Gutschein, ändern sich die Texte mit.
 */

export interface NewsletterAngebot {
  kind: GutscheinArt;
  value: number;
  min_order_amount: number;
  nur_erstbestellung: boolean;
  /** Gilt nur für bestimmte Warengruppen */
  begrenzt: boolean;
}

/** Antwort von newsletter_angebot(); alles Unlesbare ist „kein Angebot". */
export function angebotAusDaten(daten: unknown): NewsletterAngebot | null {
  if (!daten || typeof daten !== "object") return null;
  const d = daten as Record<string, unknown>;
  const wert = Number(d.value);
  if ((d.kind !== "percent" && d.kind !== "fixed") || !Number.isFinite(wert) || wert <= 0) {
    return null;
  }
  return {
    kind: d.kind,
    value: wert,
    min_order_amount: Number(d.min_order_amount) || 0,
    nur_erstbestellung: Boolean(d.nur_erstbestellung),
    begrenzt: Boolean(d.begrenzt),
  };
}

/** „5 €" statt „5,00 €"; Cent nur, wenn welche da sind. */
function euro(betrag: number): string {
  const ganz = Number.isInteger(betrag);
  return `${betrag.toLocaleString("de-DE", {
    minimumFractionDigits: ganz ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

/** „5 € Gutschein" bzw. „10 % Rabatt". */
export function angebotWert(a: NewsletterAngebot): string {
  return a.kind === "fixed" ? `${euro(a.value)} Gutschein` : `${gutscheinWert("percent", a.value)} Rabatt`;
}

/** „5 € Gutschein auf Ihre erste Bestellung" */
export function angebotTitel(a: NewsletterAngebot): string {
  return `${angebotWert(a)} auf Ihre ${a.nur_erstbestellung ? "erste " : ""}Bestellung`;
}

/** „ab 50 € Warenwert (netto)", leer ohne Mindestwert. */
export function angebotBedingung(a: NewsletterAngebot): string {
  const teile: string[] = [];
  if (a.min_order_amount > 0) teile.push(`ab ${euro(a.min_order_amount)} Warenwert (netto)`);
  if (a.begrenzt) teile.push("für ausgewählte Warengruppen");
  return teile.join(", ");
}

/** Ein Satz für Hinweise: „5 € Gutschein auf Ihre erste Bestellung ab 50 € Warenwert (netto)". */
export function angebotSatz(a: NewsletterAngebot): string {
  const bedingung = angebotBedingung(a);
  return bedingung ? `${angebotTitel(a)} ${bedingung}` : angebotTitel(a);
}
