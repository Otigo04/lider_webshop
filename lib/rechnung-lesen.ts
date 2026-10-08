import { generateText, Output } from "ai";
import { bereinige, rechnungSchema, type Rechnung } from "@/lib/rechnung-import";

/**
 * Rechnung mit dem Modell ablesen.
 *
 * Eigene Datei ohne `server-only`: das Prüfskript
 * `scripts/rechnung-lesen-check.mjs` ruft dieselbe Funktion wie der Route
 * Handler, damit ein echtes PDF ohne Browser und Anmeldung geprüft werden kann.
 *
 * Das Modell liest nur ab. Gerechnet und geprüft wird in
 * `lib/rechnung-import.ts`.
 */

/** Sonnet statt Haiku: eine falsch gelesene Menge steht sonst im Bestand. */
export const RECHNUNG_MODELL = "anthropic/claude-sonnet-4.5";

function prompt(kategorien: { id: string; name: string }[]): string {
  const liste =
    kategorien.length > 0
      ? kategorien.map((k) => `${k.id}: ${k.name}`).join("\n")
      : "(keine)";
  return `Lies diese Lieferantenrechnung eines Großhändlers ab. Rechne nichts nach, gib nur wieder, was dort steht.

Kopf:
- lieferant: Name des Rechnungsstellers (Firma im Briefkopf).
- rechnungsnummer: die Rechnungs- oder Auftragsnummer.
- datum: Rechnungsdatum als TT.MM.JJJJ, null wenn nicht lesbar.
- nettoGesamt: "Gesamt ohne MwSt." (Netto-Endsumme).
- nebenkostenNetto: Summe aus Servicegebühr, Versand, Verpackung u. ä. (netto). Diese Zeilen sind KEINE Artikel und kommen nicht in positionen. Gibt es keine: 0.

Je Artikelzeile:
- ean: die 13-stellige (oder 8-stellige) GTIN/EAN der Zeile, nur Ziffern. Bei Zeilen mit mehreren Nummern ("10224869 / 0196214147249 / 14724") ist es die lange mittlere. Keine vorhanden: null.
- artikelnummer: die Artikelnummer des Lieferanten, null wenn keine.
- name: Bezeichnung wie auf der Rechnung, auf eine Zeile zusammengezogen.
- menge: Stückzahl (Verkaufseinheiten, wie in der Spalte Menge).
- listenpreis: Preis je Einheit netto vor Rabatt (Spalte "VK-Preis", "E-Preis" o. ä.).
- rabattProzent: Rabatt der Zeile in Prozent, 0 wenn keiner.
- uvp: unverbindliche Preisempfehlung brutto (Spalte "UVP"), null wenn die Rechnung keine führt.
- zeilenbetrag: Zeilenbetrag netto laut Rechnung (Spalte "Betrag").
- warengruppeId: die ID der passendsten Warengruppe aus der Liste unten, null wenn du unsicher bist.

Warengruppen:
${liste}`;
}

export async function leseRechnung(
  bytes: Uint8Array,
  kategorien: { id: string; name: string }[],
): Promise<Rechnung> {
  const { output } = await generateText({
    model: RECHNUNG_MODELL,
    output: Output.object({ schema: rechnungSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt(kategorien) },
          { type: "file", data: bytes, mediaType: "application/pdf" },
        ],
      },
    ],
  });

  const ids = new Set(kategorien.map((k) => k.id));
  const gelesen = bereinige(output);
  return {
    ...gelesen,
    // Eine erfundene ID wäre beim Buchen ein Fremdschlüsselfehler.
    positionen: gelesen.positionen.map((p) => ({
      ...p,
      warengruppeId: p.warengruppeId && ids.has(p.warengruppeId) ? p.warengruppeId : null,
    })),
  };
}
