"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateImpressum } from "@/lib/actions/admin-settings";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IMPRESSUM_MAX_ABSCHNITTE,
  IMPRESSUM_MAX_TEXT,
  IMPRESSUM_MAX_TITEL,
  IMPRESSUM_PLATZHALTER,
  fuelleImpressum,
  type ImpressumAbschnitt,
  type ImpressumDaten,
} from "@/lib/impressum";

interface Zeile extends ImpressumAbschnitt {
  key: string;
}

function Speichern() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Impressum speichern"}
    </Button>
  );
}

/**
 * Pflege des Impressums (Migration 045): Abschnitte anlegen, umstellen,
 * löschen. Unter jedem Text steht, wie er mit den aktuellen Firmendaten
 * aussieht – ein vertippter Platzhalter fällt so vor dem Speichern auf.
 */
export function ImpressumSettings({
  abschnitte,
  gepflegt,
  daten,
}: {
  abschnitte: ImpressumAbschnitt[];
  /** false = es gilt noch die Vorlage */
  gepflegt: boolean;
  daten: ImpressumDaten;
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() =>
    abschnitte.map((a) => ({ ...a, key: crypto.randomUUID() })),
  );
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateImpressum,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state, router]);

  function aendern(key: string, feld: "titel" | "text", wert: string) {
    setZeilen((alt) => alt.map((z) => (z.key === key ? { ...z, [feld]: wert } : z)));
  }

  function verschieben(index: number, richtung: -1 | 1) {
    setZeilen((alt) => {
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= alt.length) return alt;
      const neu = [...alt];
      [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
      return neu;
    });
  }

  const nutzdaten = JSON.stringify(zeilen.map(({ titel, text }) => ({ titel, text })));

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Platzhalter</p>
        <p className="mt-1 text-muted-foreground">
          Werden beim Anzeigen durch die Firmendaten oben ersetzt. Fehlt ein
          Wert, steht er in eckigen Klammern da.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {IMPRESSUM_PLATZHALTER.map((p) => (
            <li key={p.schluessel} className="text-muted-foreground">
              <code className="code">{`{${p.schluessel}}`}</code> {p.label}
            </li>
          ))}
        </ul>
      </div>

      {!gepflegt ? (
        <p className="text-sm text-muted-foreground">
          Noch nicht angepasst – unten steht die Vorlage. Mit dem Speichern
          wird sie übernommen.
        </p>
      ) : null}

      <ol className="space-y-4">
        {zeilen.map((zeile, index) => (
          <li key={zeile.key} className="rounded-md border border-border p-4">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`titel-${zeile.key}`} className="text-xs">
                  Überschrift
                </Label>
                <Input
                  id={`titel-${zeile.key}`}
                  value={zeile.titel}
                  maxLength={IMPRESSUM_MAX_TITEL}
                  onChange={(e) => aendern(zeile.key, "titel", e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Nach oben"
                disabled={index === 0}
                onClick={() => verschieben(index, -1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Nach unten"
                disabled={index === zeilen.length - 1}
                onClick={() => verschieben(index, 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Abschnitt entfernen"
                onClick={() =>
                  setZeilen((alt) => alt.filter((z) => z.key !== zeile.key))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-3 space-y-1">
              <Label htmlFor={`text-${zeile.key}`} className="text-xs">
                Text
              </Label>
              <Textarea
                id={`text-${zeile.key}`}
                value={zeile.text}
                rows={Math.max(2, zeile.text.split("\n").length + 1)}
                maxLength={IMPRESSUM_MAX_TEXT}
                onChange={(e) => aendern(zeile.key, "text", e.target.value)}
              />
            </div>
            {zeile.text.trim() ? (
              <p className="mt-2 whitespace-pre-line border-l-2 border-border pl-3 text-xs text-muted-foreground">
                {fuelleImpressum(zeile.text, daten)}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        disabled={zeilen.length >= IMPRESSUM_MAX_ABSCHNITTE}
        onClick={() =>
          setZeilen((alt) => [...alt, { key: crypto.randomUUID(), titel: "", text: "" }])
        }
      >
        <Plus className="size-4" />
        Abschnitt hinzufügen
      </Button>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form action={formAction}>
          <input type="hidden" name="abschnitte" value={nutzdaten} />
          <Speichern />
        </form>
        {gepflegt ? (
          <form action={formAction}>
            <input type="hidden" name="zuruecksetzen" value="1" />
            <Button type="submit" variant="ghost">
              Auf Vorlage zurücksetzen
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
