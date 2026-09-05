"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateProductField } from "@/lib/actions/admin-products";
import { cn } from "@/lib/utils";

/**
 * Speicherfunktion einer Zelle. Artikel und Warengruppen bringen jeweils ihre
 * eigene Server Action mit; die Zelle selbst weiß nicht, was sie bearbeitet.
 */
export type InlineSaveAction = (input: {
  id: string;
  field: string;
  value: string;
}) => Promise<{ error?: string; success?: string }>;

/**
 * Zelle, die sich beim Anklicken in ein Eingabefeld verwandelt.
 *
 * Enter oder Verlassen speichert, Escape verwirft. Gespeichert wird sofort in
 * die Datenbank – es gibt keinen Speichern-Knopf für die ganze Tabelle, denn
 * dann müsste man sich merken, was alles offen ist.
 *
 * Bleibt der Wert unverändert, wird nichts geschickt: sonst würde jedes
 * versehentliche Anklicken eine Schreiboperation auslösen.
 */
export function InlineEdit({
  id,
  field,
  value,
  anzeige,
  speichernMit = updateProductField,
  typ = "text",
  optionen,
  ausrichtung = "left",
  einheit,
  className,
}: {
  id: string;
  field: string;
  /** Rohwert, wie er zum Server geht */
  value: string;
  /** Formatierte Anzeige im Ruhezustand (Preis, Zahl mit Trennzeichen …) */
  anzeige: string;
  /** Vorgabe ist die Artikel-Action; die Kategorieliste reicht ihre eigene durch. */
  speichernMit?: InlineSaveAction;
  typ?: "text" | "number" | "decimal" | "select";
  optionen?: { value: string; label: string }[];
  ausrichtung?: "left" | "right";
  /** Kurzes Suffix hinter dem Feld, z. B. "Stk." */
  einheit?: string;
  className?: string;
}) {
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState(value);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const feldRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (offen) feldRef.current?.focus();
  }, [offen]);

  /**
   * Der Entwurf wird beim Öffnen aus dem aktuellen Wert gesetzt, nicht in
   * einem Effekt nachgezogen: zwischen zwei Bearbeitungen kann sich der Wert
   * geändert haben (etwa durch einen Verkauf an der Kasse), und ein Effekt
   * dafür wäre eine zusätzliche Renderrunde ohne Nutzen.
   */
  function oeffnen() {
    setEntwurf(value);
    setOffen(true);
  }

  function speichern() {
    if (entwurf === value) {
      setOffen(false);
      return;
    }

    startTransition(async () => {
      const ergebnis = await speichernMit({ id, field, value: entwurf });

      if (ergebnis.error) {
        toast.error(ergebnis.error);
        setEntwurf(value);
        return;
      }

      setOffen(false);
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={oeffnen}
        title="Zum Bearbeiten anklicken"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-brand-soft",
          ausrichtung === "right" && "justify-end text-right",
          className,
        )}
      >
        <span
          className={cn(
            ausrichtung === "right" && "tabular",
            // Zahl und Einheit gehören zusammen: "10 Stk." darf nicht hinter
            // der Zahl umbrechen und die Zeile aufziehen.
            einheit && "whitespace-nowrap",
          )}
        >
          {anzeige}
          {einheit ? <span className="text-muted-foreground"> {einheit}</span> : null}
        </span>
        <Pencil
          className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </button>
    );
  }

  const gemeinsam = {
    ref: feldRef as never,
    disabled: pending,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        speichern();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setEntwurf(value);
        setOffen(false);
      }
    },
    onBlur: speichern,
    className: cn(
      "h-8 w-full min-w-24 rounded-md border-2 border-brand bg-background px-2 text-sm outline-none",
      ausrichtung === "right" && "text-right tabular",
    ),
  };

  return (
    <span className="flex items-center gap-1">
      {typ === "select" ? (
        <select
          {...gemeinsam}
          value={entwurf}
          onChange={(event) => setEntwurf(event.target.value)}
        >
          {(optionen ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...gemeinsam}
          type={typ === "text" ? "text" : "number"}
          inputMode={typ === "decimal" ? "decimal" : typ === "number" ? "numeric" : "text"}
          step={typ === "decimal" ? "0.01" : typ === "number" ? 1 : undefined}
          min={typ === "text" ? undefined : 0}
          value={entwurf}
          onChange={(event) => setEntwurf(event.target.value)}
        />
      )}
      {pending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden />
      ) : (
        <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
