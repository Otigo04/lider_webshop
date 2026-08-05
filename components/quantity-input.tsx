"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface QuantityInputProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Mengenfeld mit freiem Tippen.
 *
 * Ein reines `value={number}` lässt sich nicht leeren: das Feld fällt sofort
 * auf 0 zurück und aus einer getippten 13 wird "013". Deshalb hält die
 * Komponente den Eingabetext als eigenen Entwurf. Leer ist währenddessen
 * erlaubt; auf die gültige Menge gerundet wird erst beim Verlassen des Feldes.
 */
export function QuantityInput({
  value,
  min,
  max,
  onChange,
  id,
  label,
  disabled,
  className,
}: QuantityInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  // Wert von außen geändert (z. B. Warenkorb zusammengeführt): Entwurf
  // nachziehen. Anpassung während des Renderns statt im Effect – so gibt es
  // keinen Zwischenzustand mit der alten Zahl.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  function clamp(next: number): number {
    if (Number.isNaN(next)) return min;
    return Math.min(Math.max(next, min), Math.max(max, min));
  }

  function commit(raw: string) {
    const next = clamp(Number.parseInt(raw, 10));
    setDraft(String(next));
    setLastValue(next);
    onChange(next);
  }

  function step(delta: number) {
    const base = Number.parseInt(draft, 10);
    commit(String((Number.isNaN(base) ? min : base) + delta));
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Menge verringern"
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
      >
        <Minus className="size-4" />
      </Button>

      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={draft}
        disabled={disabled}
        className="w-20 text-center tabular"
        onChange={(event) => {
          // Nur Ziffern übernehmen, leer bleibt erlaubt.
          const raw = event.target.value.replace(/[^0-9]/g, "");
          setDraft(raw);
          const parsed = Number.parseInt(raw, 10);
          if (!Number.isNaN(parsed)) {
            setLastValue(parsed);
            onChange(parsed);
          }
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          }
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Menge erhöhen"
        disabled={disabled || value >= max}
        onClick={() => step(1)}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
