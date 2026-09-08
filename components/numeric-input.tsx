"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Zahlenfeld, das sich leeren lässt.
 *
 * Ein `value={zahl}` mit `Number(...) || 0` im onChange kann nicht leer sein:
 * die Rücktaste macht aus dem Feld sofort eine 0, und aus einer danach
 * getippten 20 wird „020". Deshalb hält die Komponente den Eingabetext als
 * eigenen Entwurf. Leer ist währenddessen erlaubt und meldet 0 nach außen;
 * beim Verlassen des Feldes wird der Entwurf auf die gültige Zahl gebracht.
 *
 * Dasselbe Muster wie in `components/quantity-input.tsx` – das ist der
 * Warenkorb mit Plus/Minus-Knöpfen, hier steht das nackte Feld für Tabellen.
 */
export function NumericInput({
  value,
  onChange,
  dezimal = false,
  onEnter,
  onFocus,
  className,
  ...rest
}: {
  value: number;
  onChange: (wert: number) => void;
  /** Kommastellen erlauben (Preise); sonst nur ganze Zahlen mit Vorzeichen */
  dezimal?: boolean;
  /** Enter im Feld – bekommt den Rohtext, nicht die geparste Zahl */
  onEnter?: (roh: string) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "onFocus"
>) {
  const [entwurf, setEntwurf] = useState(() => String(value));
  const [letzter, setLetzter] = useState(value);

  // Wert von außen geändert (zweiter Scan erhöht die Menge): Entwurf
  // nachziehen. Während des Renderns statt im Effekt – so gibt es keinen
  // Zwischenzustand mit der alten Zahl.
  if (value !== letzter) {
    setLetzter(value);
    setEntwurf(String(value));
  }

  // Minus vorn bleibt erlaubt: eine Bestandskorrektur nach unten ist eine
  // gültige Eingabe, kein Vertipper.
  const erlaubt = dezimal ? /[^0-9.,-]/g : /[^0-9-]/g;

  function lesen(roh: string): number {
    const zahl = Number(roh.replace(",", "."));
    return Number.isFinite(zahl) ? zahl : 0;
  }

  return (
    <Input
      {...rest}
      type="text"
      inputMode={dezimal ? "decimal" : "numeric"}
      value={entwurf}
      className={cn("tabular", className)}
      onFocus={(event) => {
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        const roh = event.target.value.replace(erlaubt, "");
        setEntwurf(roh);
        const zahl = lesen(roh);
        setLetzter(zahl);
        onChange(zahl);
      }}
      onBlur={(event) => {
        const zahl = lesen(event.target.value);
        setEntwurf(String(zahl));
        setLetzter(zahl);
        onChange(zahl);
        rest.onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter(event.currentTarget.value);
          return;
        }
        rest.onKeyDown?.(event);
      }}
    />
  );
}
