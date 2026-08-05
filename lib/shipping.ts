import type { DeliveryMethod } from "@/lib/types";

/** Ab diesem Netto-Warenwert ist der Versand kostenfrei. */
export const FREE_SHIPPING_THRESHOLD = 100;

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  pickup: "Selbstabholung",
  shipping: "Versand",
};

export function qualifiesForFreeShipping(netTotal: number): boolean {
  return netTotal >= FREE_SHIPPING_THRESHOLD;
}

/**
 * Hinweistext zu den Versandkosten. Es gibt keine Pauschale: unterhalb der
 * Grenze richten sich die Kosten nach Gewicht und Ziel und werden mit der
 * Auftragsbestätigung mitgeteilt. Deshalb fließen sie auch nicht in
 * total_amount ein – die Bestellsumme ist immer der reine Warenwert.
 */
export function shippingNote(netTotal: number): string {
  return qualifiesForFreeShipping(netTotal)
    ? "Versand kostenfrei ab 100 € netto."
    : "Versandkosten richten sich nach Gewicht und Ziel und werden mit der Auftragsbestätigung mitgeteilt. Ab 100 € netto versandkostenfrei.";
}
