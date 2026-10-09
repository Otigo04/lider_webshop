import { formatDate } from "@/lib/format";
import type { InvoicePdfData } from "@/lib/invoice";

/**
 * Stornorechnung: dieselbe Rechnung noch einmal, mit negativen Beträgen, eigener
 * Nummer und dem Bezug auf das Original. Die Mengen bleiben, wie sie waren –
 * storniert wird der Betrag, nicht die Stückzahl; so liest man auf dem Blatt
 * dieselben Zeilen wie auf der Rechnung.
 *
 * Reine Funktion auf der fertigen `InvoicePdfData`: gleich für Katalog-,
 * freie und Kassen-Rechnungen, und ohne Datenbank prüfbar (tests/storno.test.ts).
 * Ein zweiter Rechenweg für die Beträge gäbe es nicht – alles wird aus dem
 * Original abgeleitet, nichts neu gerechnet.
 */
export function stornoPdfData(
  original: InvoicePdfData,
  opts: {
    stornoNummer: string;
    stornoDatum: string;
    originalNummer: string;
    originalDatum: string;
    grund?: string | null;
  },
): InvoicePdfData {
  // -0 vermeiden: formatPrice(-0) könnte „-0,00 €“ drucken.
  const neg = (wert: number) => (wert === 0 ? 0 : -wert);

  const bezug = [
    `Storno zur Rechnung ${opts.originalNummer} vom ${formatDate(opts.originalDatum)}`,
    opts.grund?.trim() ? `Grund: ${opts.grund.trim()}` : null,
    original.reference ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    ...original,
    documentTitle: "Stornorechnung",
    invoiceNumber: opts.stornoNummer,
    issuedAt: opts.stornoDatum,
    reference: bezug,
    items: original.items.map((zeile) => ({
      ...zeile,
      unitPrice: neg(zeile.unitPrice),
      subtotal: neg(zeile.subtotal),
    })),
    netTotal: neg(original.netTotal),
    vatTotal: neg(original.vatTotal),
    grossTotal: neg(original.grossTotal),
    vatBreakdown: original.vatBreakdown?.map((zeile) => ({
      ...zeile,
      net: neg(zeile.net),
      vat: neg(zeile.vat),
    })),
    // Ein Zahlungsziel auf einem Storno wäre falsch; die Rückzahlung steht
    // stattdessen im Zahlungshinweis.
    paymentNote:
      "Der Betrag wird Ihnen erstattet bzw. mit offenen Forderungen verrechnet.",
    deliveryAddress: null,
  };
}
