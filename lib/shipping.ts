import type { DeliveryMethod } from "@/lib/types";

/**
 * Versandkostenfreigrenze.
 *
 * Der Wert steht in `company_settings.free_shipping_threshold` (Migration 037)
 * und wird unter /admin/settings gepflegt – nicht hier im Code. Eine Zusage
 * über Versandkosten ist eine Betriebsentscheidung; stand sie im Code, musste
 * für eine Änderung neu ausgeliefert werden, und der Text der Hinweisleiste
 * lief daneben eigene Wege.
 *
 * Die Konstante bleibt als Rückfall für den Fall, dass die Migration noch
 * nicht eingespielt ist. Sie trägt denselben Wert wie die Spaltenvorgabe –
 * zwei verschiedene Zahlen wären genau der Widerspruch, den das hier ablösen
 * soll.
 */
export const FREE_SHIPPING_THRESHOLD = 300;

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  pickup: "Selbstabholung",
  shipping: "Versand",
};

/** Grenze aus den Firmendaten, abgesichert gegen fehlende oder kaputte Werte. */
export function freeShippingThreshold(
  wert: number | null | undefined,
): number {
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl >= 0 ? zahl : FREE_SHIPPING_THRESHOLD;
}

/**
 * „300 €" statt „300,00 €": die Grenze ist eine Werbeangabe und steht in
 * Fließtext. Nachkommastellen bekommt sie nur, wenn sie welche hat.
 */
export function formatThreshold(wert: number): string {
  return Number.isInteger(wert)
    ? `${wert.toLocaleString("de-DE")} €`
    : wert.toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
      });
}

export function qualifiesForFreeShipping(
  netTotal: number,
  threshold: number = FREE_SHIPPING_THRESHOLD,
): boolean {
  return netTotal >= freeShippingThreshold(threshold);
}

/**
 * Hinweistext zu den Versandkosten. Es gibt keine Pauschale: unterhalb der
 * Grenze richten sich die Kosten nach Gewicht und Ziel und werden mit der
 * Auftragsbestätigung mitgeteilt. Deshalb fließen sie auch nicht in
 * total_amount ein – die Bestellsumme ist immer der reine Warenwert.
 */
export function shippingNote(
  netTotal: number,
  threshold: number = FREE_SHIPPING_THRESHOLD,
): string {
  const grenze = freeShippingThreshold(threshold);

  // Ohne Grenze ist jede Lieferung frei – dann wäre „ab 0 €" eine Angabe, die
  // niemand braucht.
  if (grenze <= 0) return "Versand kostenfrei.";

  return qualifiesForFreeShipping(netTotal, grenze)
    ? `Versand kostenfrei ab ${formatThreshold(grenze)} netto.`
    : `Versandkosten richten sich nach Gewicht und Ziel und werden mit der Auftragsbestätigung mitgeteilt. Ab ${formatThreshold(grenze)} netto versandkostenfrei.`;
}
