"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { saveCashEntry } from "@/lib/actions/admin-kassenbuch";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import type { CashEntry } from "@/lib/queries/kassenbuch";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </Button>
  );
}

/**
 * Tageseintrag. Wird das Datum auf einen Tag mit vorhandenem Eintrag gestellt,
 * erscheinen dessen Werte – Speichern überschreibt dann diesen Tag.
 */
export function KassenbuchForm({
  vorgabe,
  eintraege,
  heute,
  monat,
}: {
  vorgabe: CashEntry | null;
  /** Einträge des angezeigten Monats, zum Vorbefüllen */
  eintraege: CashEntry[];
  heute: string;
  monat: string;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(saveCashEntry, {});
  const router = useRouter();

  const [datum, setDatum] = useState(vorgabe?.entry_date ?? heute);
  const [bar, setBar] = useState(vorgabe?.cash ?? 0);
  const [karte, setKarte] = useState(vorgabe?.card ?? 0);
  const [gross, setGross] = useState(vorgabe?.wholesale ?? 0);
  const [notiz, setNotiz] = useState(vorgabe?.note ?? "");
  // Zähler als key, damit die Zahlenfelder nach dem Vorbefüllen neu starten
  const [version, setVersion] = useState(0);

  function datumWechseln(neu: string) {
    setDatum(neu);
    const vorhanden = eintraege.find((e) => e.entry_date === neu);
    setBar(vorhanden?.cash ?? 0);
    setKarte(vorhanden?.card ?? 0);
    setGross(vorhanden?.wholesale ?? 0);
    setNotiz(vorhanden?.note ?? "");
    setVersion((v) => v + 1);
  }

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (!state.success) return;
    toast.success(state.success);
    // Nach dem Speichern zurück auf einen leeren Eintrag im Monat des Tages
    router.push(`/admin/kassenbuch?monat=${datum.slice(0, 7)}`);
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const vorhanden = eintraege.some((e) => e.entry_date === datum);

  return (
    <form
      action={formAction}
      key={`${monat}-${vorgabe?.id ?? "neu"}`}
      className="rounded-md border border-border p-4"
    >
      <input type="hidden" name="cash" value={bar} />
      <input type="hidden" name="card" value={karte} />
      <input type="hidden" name="wholesale" value={gross} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 space-y-1.5 md:col-span-1">
          <Label htmlFor="entry_date">Datum</Label>
          <Input
            id="entry_date"
            name="entry_date"
            type="date"
            required
            value={datum}
            onChange={(e) => e.target.value && datumWechseln(e.target.value)}
          />
        </div>
        {(
          [
            ["Bargeld", bar, setBar],
            ["Karte", karte, setKarte],
            ["Großhandel", gross, setGross],
          ] as const
        ).map(([label, wert, setter]) => (
          <div key={`${label}-${version}`} className="space-y-1.5">
            <Label>{label} (€)</Label>
            <NumericInput value={wert} onChange={setter} dezimal aria-label={label} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="note">Notiz (optional)</Label>
          <Input
            id="note"
            name="note"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            maxLength={300}
          />
        </div>
        <SubmitButton />
      </div>
      {vorhanden ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Für diesen Tag gibt es schon einen Eintrag – Speichern überschreibt ihn.
        </p>
      ) : null}
    </form>
  );
}
