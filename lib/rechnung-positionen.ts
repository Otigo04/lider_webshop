import { rabatte } from "@/lib/rabatt";
import { resolveTier } from "@/lib/pricing";
import type { PriceTier } from "@/lib/types";

/*
 * Positionen der Rechnung (/kasse/rechnungen/new): jede ist entweder ein
 * Katalogartikel oder eine freie Position. Reine Rechenstelle für Formular und
 * Test; gebucht wird in der Datenbank (create_admin_order, Migration 079).
 */

export interface KatalogPosition {
  art: "katalog";
  key: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Preis von Hand geändert – dann zieht eine neue Menge keine andere Staffel nach */
  preisManuell: boolean;
}

export interface FreiePosition {
  art: "frei";
  key: string;
  /** Gescannt oder getippt; steht nur auf der Rechnung, gerechnet wird damit nichts */
  barcode: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export type Position = KatalogPosition | FreiePosition;

export interface Suchartikel {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  variants: PriceTier[];
}

function aufCent(wert: number): number {
  return Math.round(wert * 100) / 100;
}

/**
 * Sieht der Text nach einem Code aus (Strichcode, Artikelnummer) und nicht nach
 * einem Wort? Mindestens fünf Zeichen, nur Buchstaben, Ziffern und -._/, ohne
 * Leerzeichen, mit mindestens einer Ziffer. „Ladekabel" ist ein Wort,
 * „4006381333931" und „12-0034" sind Codes.
 */
export function istCode(text: string): boolean {
  return /^(?=.*\d)[0-9A-Za-z\-._/]{5,}$/.test(text.trim());
}

/**
 * Artikel zu einem gescannten Code: erst der Strichcode, dann die Artikelnummer
 * (ohne Beachtung der Groß-/Kleinschreibung). Nur genaue Treffer – ein Teilstück
 * ist ein Suchbegriff, kein Scan.
 */
export function findeArtikel<T extends Pick<Suchartikel, "sku" | "barcode">>(
  artikel: T[],
  text: string,
): T | null {
  const t = text.trim();
  if (!t) return null;
  return (
    artikel.find((a) => a.barcode?.trim() === t) ??
    artikel.find((a) => a.sku.toLowerCase() === t.toLowerCase()) ??
    null
  );
}

/** Stückpreis der Staffel für die Menge; null, wenn keine Staffel passt. */
export function stufenpreis(variants: PriceTier[], menge: number): number | null {
  const stufe = resolveTier(variants, menge);
  return stufe ? Number(stufe.unit_price) : null;
}

export function positionSumme(p: Pick<Position, "quantity" | "unitPrice">): number {
  return aufCent(p.quantity * p.unitPrice);
}

/**
 * Was an `create_admin_order` geht. Katalog: Artikel, Menge, Preis (der Preis
 * steht im Formular schon fest, auch aus der Staffel). Frei: Beschreibung,
 * Menge, Preis, Barcode.
 */
export function positionenPayload(positions: Position[]) {
  return positions.map((p) =>
    p.art === "katalog"
      ? { product_id: p.productId, quantity: p.quantity, unit_price: p.unitPrice }
      : {
          description: p.description.trim(),
          quantity: p.quantity,
          unit_price: p.unitPrice,
          barcode: p.barcode.trim(),
        },
  );
}

export interface BelegSummen {
  warenwert: number;
  katalog: number;
  frei: number;
  kundenRabatt: number;
  netto: number;
}

/**
 * Summen wie `create_admin_order`: Warenwert aller Zeilen, die Sonderkondition
 * nur auf die Katalogzeilen (wie an der Kasse), freie Zeilen kommen voll dazu.
 */
export function belegSummen(positions: Position[], kundenSatz: number): BelegSummen {
  const katalog = aufCent(
    positions.filter((p) => p.art === "katalog").reduce((s, p) => s + positionSumme(p), 0),
  );
  const frei = aufCent(
    positions.filter((p) => p.art === "frei").reduce((s, p) => s + positionSumme(p), 0),
  );
  const r = rabatte(katalog, kundenSatz);
  return {
    warenwert: aufCent(katalog + frei),
    katalog,
    frei,
    kundenRabatt: r.kundenRabatt,
    netto: aufCent(frei + r.netto),
  };
}

/**
 * Erster Grund, warum sich der Beleg noch nicht anlegen lässt; null = in
 * Ordnung. Ein Lieferschein trägt keine Preise: dort wird keiner verlangt.
 */
export function positionsFehler(
  positions: Position[],
  options: { ohnePreise?: boolean } = {},
): string | null {
  if (positions.length === 0) return "Noch keine Position.";
  for (const [i, p] of positions.entries()) {
    const nr = `Position ${i + 1}`;
    if (p.art === "frei" && !p.description.trim()) return `${nr}: Beschreibung fehlt.`;
    if (!(p.quantity >= 1) || !Number.isInteger(p.quantity)) return `${nr}: Menge fehlt.`;
    if (!options.ohnePreise && !(p.unitPrice > 0)) return `${nr}: Preis fehlt.`;
  }
  return null;
}

/**
 * Positionen einer bestehenden Bestellung als Formularzeilen – damit sich ein
 * Beleg bearbeiten lässt, ohne alles noch einmal einzugeben. Eine Position mit
 * Artikelnummer, die es im Katalog noch gibt, wird eine Katalogzeile (Preis und
 * Menge wie gebucht, der Preis gilt als von Hand gesetzt: eine neue Menge soll
 * ihn nicht still ändern). Alles andere – freie Positionen, gelöschte Artikel –
 * wird eine freie Zeile mit Name, Menge, Preis und Barcode.
 */
export function positionenAusBestellung(
  items: {
    product_sku: string;
    product_name: string;
    quantity: number | string;
    unit_price: number | string;
    barcode?: string | null;
  }[],
  produkte: { id: string; sku: string }[],
): Position[] {
  const nachSku = new Map(produkte.map((p) => [p.sku, p.id]));
  return items.map((item, i): Position => {
    const produktId = item.product_sku ? nachSku.get(item.product_sku) : undefined;
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    if (produktId) {
      return {
        art: "katalog",
        key: `alt-${i}`,
        productId: produktId,
        quantity,
        unitPrice,
        preisManuell: true,
      };
    }
    return {
      art: "frei",
      key: `alt-${i}`,
      barcode: item.barcode?.trim() ?? "",
      description: item.product_name,
      quantity,
      unitPrice,
    };
  });
}
