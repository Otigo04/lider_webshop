import type { DeliveryMethod, PaymentMethod } from "@/lib/types";

/**
 * Zahlarten, die für diese Kombination zulässig sind. Reine Anzeigehilfe: die
 * verbindliche Prüfung steht in create_order() und im Trigger der Migration
 * 072. Hier wird nur entschieden, welche Kacheln der Checkout zeigt und
 * anbietet.
 */
export function erlaubteZahlarten(
  lieferart: DeliveryMethod,
  darfRechnung: boolean,
): PaymentMethod[] {
  const zahlarten: PaymentMethod[] = [];
  if (darfRechnung) zahlarten.push("transfer");
  zahlarten.push("prepayment");
  if (lieferart === "pickup") zahlarten.push("cash", "card");
  return zahlarten;
}

/** Vorauswahl im Checkout. */
export function vorgabeZahlart(darfRechnung: boolean): PaymentMethod {
  return darfRechnung ? "transfer" : "prepayment";
}

/** Läuft die Zahlung per Überweisung (Vorkasse oder Rechnung)? */
export function istUeberweisung(zahlart: PaymentMethod): boolean {
  return zahlart === "transfer" || zahlart === "prepayment";
}
