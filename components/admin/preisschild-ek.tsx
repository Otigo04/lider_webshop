import { formatPrice } from "@/lib/format";
import { brutto } from "@/lib/vat";

/**
 * Einkaufspreis, nur fürs Haus – netto und brutto in einer Zeile.
 *
 * Liegt absolut in der unteren linken Ecke des Rahmens (der Elternteil muss
 * `relative` sein), im Innenabstand: so schiebt er nichts nach unten, wenn er
 * erscheint oder verschwindet. Gedruckt wird er nie.
 */
export function PreisschildEk({
  netto,
  satz,
}: {
  netto: number;
  /** Steuersatz in Prozent aus den Firmendaten, nicht festverdrahtet. */
  satz: number;
}) {
  return (
    <p
      className="tabular pointer-events-none absolute bottom-0.5 left-2 text-[10px] leading-none text-muted-foreground/60"
      title="Einkaufspreis – nur intern, steht auf keinem Schild"
    >
      EK netto {formatPrice(netto)} · brutto {formatPrice(brutto(netto, satz))}
    </p>
  );
}
