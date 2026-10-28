"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { flagsMassenAendern } from "@/lib/actions/product-flags";
import {
  aenderungAusWahl,
  aenderungText,
  FESTE_FLAGS,
  FESTE_FLAG_LABELS,
  hatAenderung,
  type FesterFlag,
  type FlagWahl,
} from "@/lib/flags-massen";
import type { ProductFlagDef } from "@/lib/types";
import { cn } from "@/lib/utils";

const WAHLEN: { wert: FlagWahl; label: string; titel: string }[] = [
  { wert: "", label: "–", titel: "Unverändert lassen" },
  { wert: "an", label: "Setzen", titel: "Bei allen gewählten Artikeln setzen" },
  { wert: "aus", label: "Entfernen", titel: "Bei allen gewählten Artikeln entfernen" },
];

function Wahl({
  wert,
  onChange,
  name,
}: {
  wert: FlagWahl;
  onChange: (wert: FlagWahl) => void;
  name: string;
}) {
  return (
    <div role="group" aria-label={name} className="inline-flex rounded-md border border-border p-0.5">
      {WAHLEN.map((w) => (
        <button
          key={w.wert}
          type="button"
          title={w.titel}
          aria-pressed={wert === w.wert}
          onClick={() => onChange(w.wert)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            wert === w.wert
              ? w.wert === "aus"
                ? "bg-signal text-signal-foreground"
                : "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Flags für alle angekreuzten Artikel auf einmal. Je Flag „–" (nicht anfassen),
 * „Setzen" oder „Entfernen": so lässt sich eine Neuheit setzen, ohne dass bei
 * Artikeln, die schon Topseller sind, etwas verloren geht. Geschrieben wird in
 * einem Aufruf (`flagsMassenAendern`); die Regeln stehen in `lib/flags-massen.ts`.
 */
export function FlagsMassenPanel({
  customFlags,
  anzahl,
  holeIds,
  onFertig,
}: {
  customFlags: ProductFlagDef[];
  anzahl: number;
  holeIds: () => string[];
  onFertig: (meldung: string) => void;
}) {
  const [fest, setFest] = useState<Partial<Record<FesterFlag, FlagWahl>>>({});
  const [eigene, setEigene] = useState<Record<string, FlagWahl>>({});
  const [ware, setWare] = useState<"" | "A" | "B" | "loeschen">("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const aenderung = aenderungAusWahl(fest, eigene, ware);
  const namen = Object.fromEntries(customFlags.map((f) => [f.id, f.name]));
  const text = aenderungText(aenderung, namen);

  function anwenden() {
    setFehler(null);
    starte(async () => {
      const ergebnis = await flagsMassenAendern({
        ids: holeIds(),
        fest: aenderung.fest,
        eigene: aenderung.eigene,
        ware: aenderung.ware,
      });
      if (ergebnis.error) {
        setFehler(ergebnis.error);
        return;
      }
      onFertig(`${ergebnis.artikel ?? anzahl} Artikel geändert: ${text}.`);
    });
  }

  return (
    <div className="mx-auto max-h-80 max-w-7xl overflow-y-auto border-b border-border px-4 py-3">
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {FESTE_FLAGS.map((flag) => (
          <div key={flag} className="flex items-center justify-between gap-3">
            <span className="text-sm">{FESTE_FLAG_LABELS[flag]}</span>
            <Wahl
              name={FESTE_FLAG_LABELS[flag]}
              wert={fest[flag] ?? ""}
              onChange={(w) => setFest((alt) => ({ ...alt, [flag]: w }))}
            />
          </div>
        ))}

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="massen-ware" className="text-sm">
            Güteklasse Restposten
          </label>
          <select
            id="massen-ware"
            value={ware}
            onChange={(e) => setWare(e.target.value as typeof ware)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">unverändert</option>
            <option value="A">A-Ware setzen</option>
            <option value="B">B-Ware setzen</option>
            <option value="loeschen">Klasse löschen</option>
          </select>
        </div>

        {customFlags.map((flag) => (
          <div key={flag.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <span aria-hidden className={`size-2 shrink-0 rounded-full tag-dot-${flag.color}`} />
              <span className="truncate">{flag.name}</span>
            </span>
            <Wahl
              name={flag.name}
              wert={eigene[flag.id] ?? ""}
              onChange={(w) => setEigene((alt) => ({ ...alt, [flag.id]: w }))}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={anwenden} disabled={laeuft || !hatAenderung(aenderung)}>
          {laeuft ? "Wird gespeichert …" : `Auf ${anzahl} ${anzahl === 1 ? "Artikel" : "Artikel"} anwenden`}
        </Button>
        <p className="text-xs text-muted-foreground">
          {hatAenderung(aenderung)
            ? text
            : "Je Flag wählen: Setzen oder Entfernen. „–" + "“ lässt es, wie es ist."}
        </p>
        {fehler ? (
          <p role="alert" className="text-sm text-destructive">
            {fehler}
          </p>
        ) : null}
      </div>
    </div>
  );
}
