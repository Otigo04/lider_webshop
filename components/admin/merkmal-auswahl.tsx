"use client";

import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductAttributeGroup } from "@/lib/types";

/**
 * Merkmale an einem Artikel anhaken (Migration 032).
 *
 * Steht überall dort, wo Artikel entstehen – Artikelformular, Kassendialog,
 * Wareneingang – und ist deshalb eine Komponente und kein Formularabschnitt:
 * dieselbe Auswahl dreimal nachzubauen hieße, sie dreimal auseinanderlaufen zu
 * lassen.
 *
 * **Zugeklappt** als Vorgabe. Merkmale sind die Ausnahme, nicht die Regel: die
 * meisten Artikel kommen ohne aus, und ein aufgeklappter Block mit vier
 * Farbreihen schöbe Preise und Bestand aus dem Bild. Sind schon Merkmale
 * gesetzt, steht die Zahl am Aufklapper – ein zugeklappter Block darf nichts
 * verstecken, was jemand eingetragen hat.
 *
 * `<details>` statt eines eigenen Zustands: der Browser kann das, und im
 * Wareneingang steht die Auswahl in einer Tabellenzelle, wo jeder zusätzliche
 * React-Zustand pro Zeile mitgezogen werden müsste.
 */
export function MerkmalAuswahl({
  attributes,
  selected,
  onChange,
  className,
  idPrefix = "merkmal",
}: {
  attributes: ProductAttributeGroup[];
  /** IDs der gesetzten Werte */
  selected: string[];
  onChange: (valueIds: string[]) => void;
  className?: string;
  /** Eindeutig je Vorkommen – im Wareneingang stehen mehrere auf einer Seite */
  idPrefix?: string;
}) {
  // Merkmale ohne Werte sind unfertig gepflegt und hätten hier nichts zum
  // Anklicken – sie fallen weg statt als leere Reihe dazustehen.
  const gepflegt = attributes.filter((attribut) => attribut.values.length > 0);
  if (gepflegt.length === 0) return null;

  const gesetzt = new Set(selected);

  function umschalten(valueId: string) {
    const neu = new Set(gesetzt);
    if (neu.has(valueId)) neu.delete(valueId);
    else neu.add(valueId);
    onChange([...neu]);
  }

  return (
    <details className={cn("group rounded-lg border border-border", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          Merkmale
          {selected.length > 0 ? (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-brand-foreground tabular">
              {selected.length}
            </span>
          ) : (
            <span className="text-xs font-normal text-muted-foreground">
              Farbe, Größe, Material – optional
            </span>
          )}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="space-y-4 border-t border-border px-4 py-4">
        {gepflegt.map((attribut) => (
          <fieldset key={attribut.id}>
            <legend className="eyebrow text-muted-foreground">
              {attribut.name}
            </legend>

            <div className="mt-2 flex flex-wrap gap-2">
              {attribut.values.map((wert) => {
                const an = gesetzt.has(wert.id);
                const id = `${idPrefix}-${wert.id}`;

                // Farbe als Kreis, alles andere als Schildchen. Der Haken auf
                // dem Kreis ist nicht Zierde: ein hell umrandeter Kreis allein
                // ist bei Weiß oder Beige kein erkennbarer Unterschied.
                return attribut.kind === "color" ? (
                  <button
                    key={wert.id}
                    id={id}
                    type="button"
                    role="checkbox"
                    aria-checked={an}
                    title={wert.label}
                    onClick={() => umschalten(wert.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors",
                      an
                        ? "border-brand bg-brand-soft font-medium text-brand"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-black/20"
                      style={{ backgroundColor: wert.hex ?? "transparent" }}
                    >
                      {an ? (
                        <Check
                          className="size-3.5 drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                          stroke="white"
                          strokeWidth={3.5}
                        />
                      ) : null}
                    </span>
                    {wert.label}
                  </button>
                ) : (
                  <button
                    key={wert.id}
                    id={id}
                    type="button"
                    role="checkbox"
                    aria-checked={an}
                    onClick={() => umschalten(wert.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      an
                        ? "border-brand bg-brand font-medium text-brand-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {wert.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <p className="text-xs text-muted-foreground">
          Gepflegt werden Merkmale und Werte unter Einstellungen. Was hier
          angehakt ist, steht im Shop am Artikel und lässt sich dort filtern.
        </p>
      </div>
    </details>
  );
}
