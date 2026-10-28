/*
 * „Preis auf Anfrage" (Migration 077): der Knopf öffnet eine neue Mail an die
 * Kontaktadresse aus den Firmendaten, mit Artikelname und -nummer im Text. Ohne
 * gepflegte Adresse führt der Knopf auf die Kontaktseite – nie ins Leere.
 */

export function preisAnfrageLink(
  email: string | null | undefined,
  name: string,
  sku: string,
): string {
  const adresse = email?.trim();
  if (!adresse || /[\s,;<>]/.test(adresse)) return "/kontakt";
  const betreff = `Preisanfrage: ${name} (${sku})`;
  const text = [
    "Guten Tag,",
    "",
    "bitte nennen Sie mir den Preis für diesen Artikel:",
    "",
    name,
    `Artikelnummer: ${sku}`,
    "",
    "Gewünschte Menge: ",
    "",
    "Vielen Dank",
  ].join("\r\n");
  return `mailto:${adresse}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Text unter „Preis auf Anfrage", wenn am Artikel keiner steht. */
export const PREIS_ANFRAGE_STANDARDTEXT =
  "Für diesen Artikel nennen wir den Preis persönlich. Schreiben Sie uns kurz Ihre gewünschte Menge – wir melden uns mit Ihrem Preis.";

/** Der Text des Artikels, sonst der Standard. Leer und nur Leerzeichen zählen als leer. */
export function preisAnfrageText(eigener: string | null | undefined): string {
  const text = eigener?.trim();
  return text ? text : PREIS_ANFRAGE_STANDARDTEXT;
}
