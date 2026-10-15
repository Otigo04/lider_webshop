"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateOeffnungszeiten } from "@/lib/actions/admin-oeffnungszeiten";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { WOCHENTAGE, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Öffnungszeiten speichern"}
    </Button>
  );
}

const zeitfeld =
  "h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40";

export function OeffnungszeitenForm({ zeiten }: { zeiten: Oeffnungszeiten }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateOeffnungszeiten,
    {},
  );
  const [zu, setZu] = useState(() => zeiten.map((tag) => tag === null));

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {WOCHENTAGE.map((name, i) => (
          <li
            key={name}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <span className="w-28 text-sm font-medium">{name}</span>
            <input
              type="time"
              name={`tag${i}_open`}
              defaultValue={zeiten[i]?.open ?? "11:00"}
              disabled={zu[i]}
              aria-label={`${name} von`}
              className={zeitfeld}
            />
            <span className="text-sm text-muted-foreground">bis</span>
            <input
              type="time"
              name={`tag${i}_close`}
              defaultValue={zeiten[i]?.close ?? "18:30"}
              disabled={zu[i]}
              aria-label={`${name} bis`}
              className={zeitfeld}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={`tag${i}_zu`}
                name={`tag${i}_zu`}
                checked={zu[i]}
                onCheckedChange={(c) =>
                  setZu((alt) => alt.map((w, j) => (j === i ? c === true : w)))
                }
              />
              <Label htmlFor={`tag${i}_zu`} className="font-normal">
                geschlossen
              </Label>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Die Zeiten gelten für die Anzeige im Shop und für die Wahl des
        Abholtermins. Ein Abholtermin außerhalb dieser Zeiten wird abgewiesen.
      </p>
      <SaveButton />
    </form>
  );
}
