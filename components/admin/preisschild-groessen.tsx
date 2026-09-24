"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLabelSize,
  deleteLabelSize,
  updateLabelSize,
} from "@/lib/actions/preisschilder";
import { MASS_GRENZEN, proBogen, type SchildFormat } from "@/lib/preisschild";

/**
 * Schildgrößen in Millimetern pflegen (Migration 039).
 *
 * Millimeter statt Spalten und Zeilen: am Regal wird gemessen, welches Schild
 * in die Schiene passt. Wie viele davon auf einen A4-Bogen gehen, steht
 * daneben und ergibt sich aus dem Maß – es ist Auskunft, keine Eingabe.
 *
 * Gespeichert wird auf Knopfdruck und nicht beim Verlassen des Feldes: eine
 * Größe hat drei zusammengehörige Werte, und wer von der Breite zur Höhe
 * springt, ist mit dem Ändern noch nicht fertig.
 */
export function PreisschildGroessen({ formate }: { formate: SchildFormat[] }) {
  const [neu, setNeu] = useState({ name: "", breite: 60, hoehe: 40 });
  const [speichert, starten] = useTransition();
  const router = useRouter();

  // Ohne eingespielte Migration stehen hier die Vorgaben aus dem Quelltext.
  // Sie haben keine Datenbankzeile und lassen sich deshalb nicht ändern.
  const nurVorgaben = formate.every((f) => f.id.startsWith("standard-"));

  function anlegen() {
    starten(async () => {
      const ergebnis = await createLabelSize(neu);
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      toast.success(ergebnis.success!);
      setNeu({ name: "", breite: 60, hoehe: 40 });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div>
        <h2 className="text-sm font-semibold">Schildgrößen</h2>
        <p className="text-xs text-muted-foreground">
          Breite und Höhe in Millimetern, wie das Schild nach dem Ausschneiden
          sein soll. Zwischen {MASS_GRENZEN.min} mm und{" "}
          {MASS_GRENZEN.maxBreite} × {MASS_GRENZEN.maxHoehe} mm – das ist die
          bedruckbare Fläche eines A4-Bogens.
        </p>
      </div>

      {nurVorgaben ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Es werden die drei Vorgaben angezeigt. Eigene Größen lassen sich
          anlegen, sobald{" "}
          <code className="font-mono">039_schildgroessen.sql</code>{" "}
          eingespielt ist.
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {formate.map((format) => (
          <GroessenZeile key={format.id} format={format} />
        ))}
      </ul>

      <div className="mt-4 border-t border-border pt-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto] sm:items-end">
          <Feld label="Name" htmlFor="neue-groesse-name">
            <Input
              id="neue-groesse-name"
              value={neu.name}
              onChange={(event) =>
                setNeu((alt) => ({ ...alt, name: event.target.value }))
              }
              placeholder="z. B. Regalschiene 60"
              className="h-9"
            />
          </Feld>
          <Feld label="Breite (mm)" htmlFor="neue-groesse-breite">
            <NumericInput
              id="neue-groesse-breite"
              dezimal
              value={neu.breite}
              onChange={(wert) => setNeu((alt) => ({ ...alt, breite: wert }))}
              className="h-9"
            />
          </Feld>
          <Feld label="Höhe (mm)" htmlFor="neue-groesse-hoehe">
            <NumericInput
              id="neue-groesse-hoehe"
              dezimal
              value={neu.hoehe}
              onChange={(wert) => setNeu((alt) => ({ ...alt, hoehe: wert }))}
              className="h-9"
            />
          </Feld>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={speichert || !neu.name.trim()}
            onClick={anlegen}
          >
            <Plus className="size-4" aria-hidden />
            Größe anlegen
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Eine Größe: Name und Maße ändern, löschen. */
function GroessenZeile({ format }: { format: SchildFormat }) {
  const router = useRouter();
  const [entwurf, setEntwurf] = useState({
    name: format.name,
    breite: format.breite,
    hoehe: format.hoehe,
  });
  const [laeuft, starten] = useTransition();

  const vorgabe = format.id.startsWith("standard-");
  const geaendert =
    entwurf.name !== format.name ||
    entwurf.breite !== format.breite ||
    entwurf.hoehe !== format.hoehe;

  // Die Anzahl richtet sich nach dem Entwurf, nicht nach dem gespeicherten
  // Maß: wer 70 mm eintippt, will sofort sehen, wie viele dann draufgehen.
  const passen = proBogen({ ...format, ...entwurf });

  function speichern() {
    starten(async () => {
      const ergebnis = await updateLabelSize({ id: format.id, ...entwurf });
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      toast.success(ergebnis.success!);
      router.refresh();
    });
  }

  function loeschen() {
    starten(async () => {
      const ergebnis = await deleteLabelSize(format.id);
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      toast.success(ergebnis.success!);
      router.refresh();
    });
  }

  return (
    <li className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto] sm:items-center">
      <Input
        value={entwurf.name}
        disabled={vorgabe || laeuft}
        onChange={(event) =>
          setEntwurf((alt) => ({ ...alt, name: event.target.value }))
        }
        aria-label={`Name der Größe ${format.name}`}
        className="h-9"
      />
      <NumericInput
        dezimal
        value={entwurf.breite}
        disabled={vorgabe || laeuft}
        onChange={(wert) => setEntwurf((alt) => ({ ...alt, breite: wert }))}
        aria-label={`Breite von ${format.name} in Millimetern`}
        className="h-9"
      />
      <NumericInput
        dezimal
        value={entwurf.hoehe}
        disabled={vorgabe || laeuft}
        onChange={(wert) => setEntwurf((alt) => ({ ...alt, hoehe: wert }))}
        aria-label={`Höhe von ${format.name} in Millimetern`}
        className="h-9"
      />
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-muted-foreground tabular">
          {passen} je Bogen
        </span>
        {geaendert ? (
          <Button type="button" size="sm" disabled={laeuft} onClick={speichern}>
            Speichern
          </Button>
        ) : null}
        {!vorgabe ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            disabled={laeuft}
            onClick={loeschen}
            aria-label={`Größe „${format.name}" löschen`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function Feld({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        className="block text-[11px] font-medium text-muted-foreground"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
