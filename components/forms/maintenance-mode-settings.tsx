"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  setMaintenanceMode,
  updateMaintenanceContent,
} from "@/lib/actions/admin-settings";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Text speichern"}
    </Button>
  );
}

/**
 * Ein Schalter, kein Formular: Wartungsmodus an/aus ist ein einzelnes Bit
 * (Migration 041), das sofort beim Klicken greift – kein Speichern-Knopf,
 * an dem eine halb umgeschaltete Seite hängen bleiben könnte. Text und Datum
 * (Migration 043) sind dagegen ein kleines Formular mit eigenem
 * Speichern-Knopf, weil hier getippt statt geklickt wird.
 */
export function MaintenanceModeSettings({
  aktiv: initial,
  titel,
  nachricht,
  datum,
}: {
  aktiv: boolean;
  titel: string | null;
  nachricht: string | null;
  datum: string | null;
}) {
  const [aktiv, setAktiv] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(checked: boolean) {
    setAktiv(checked);
    startTransition(async () => {
      const result = await setMaintenanceMode(checked);
      if (result.error) {
        toast.error(result.error);
        setAktiv(!checked);
        return;
      }
      toast.success(result.success ?? "Gespeichert.");
      router.refresh();
    });
  }

  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateMaintenanceContent,
    {},
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-md border px-4 py-3",
          aktiv ? "border-signal/40 bg-signal-soft" : "border-border bg-card",
        )}
      >
        <Checkbox
          id="maintenance_mode"
          checked={aktiv}
          disabled={pending}
          onCheckedChange={(checked) => handleChange(checked === true)}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor="maintenance_mode" className="font-medium">
            Wartungsmodus{" "}
            <span
              className={cn(
                "ml-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                aktiv
                  ? "bg-signal text-signal-foreground"
                  : "bg-success/15 text-success",
              )}
            >
              {aktiv ? "aktiv" : "aus"}
            </span>
          </Label>
          <p className="text-sm text-muted-foreground">
            Unregistrierte Besucher sehen statt der Seiten den Wartungsscreen
            (/wartung) – auch /login und /register sind währenddessen
            gesperrt. Wer bereits angemeldet ist (Kunde oder Admin), bleibt
            unbeeinträchtigt.
          </p>
          {aktiv ? (
            <p className="text-sm font-medium text-signal">
              Achtung: verliert dieses Konto seine Sitzung, während der
              Schalter aktiv ist, führt auch /login nur noch zum
              Wartungsscreen. Zurücksetzen dann per Supabase SQL-Editor.
            </p>
          ) : null}
        </div>
      </div>

      <form action={formAction} className="space-y-3 rounded-md border border-border bg-card px-4 py-3">
        <div className="space-y-2">
          <Label htmlFor="maintenance_title">Eigener Titel (optional)</Label>
          <Input
            id="maintenance_title"
            name="maintenance_title"
            maxLength={80}
            defaultValue={titel ?? ""}
            placeholder="Hier entsteht etwas Großes."
          />
          <p className="text-xs text-muted-foreground">
            Leer lassen zeigt den Standardtitel auf /wartung.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maintenance_message">Eigene Nachricht (optional)</Label>
          <Textarea
            id="maintenance_message"
            name="maintenance_message"
            rows={3}
            maxLength={400}
            defaultValue={nachricht ?? ""}
            placeholder="Unser neuer Webshop ist in Eigenentwicklung. In Kürze sind wir wieder für Sie da."
          />
          <p className="text-xs text-muted-foreground">
            Leer lassen zeigt den Standardtext auf /wartung.
          </p>
        </div>

        <div className="space-y-2 sm:w-64">
          <Label htmlFor="maintenance_until">
            Voraussichtlich verfügbar ab (optional)
          </Label>
          <Input
            id="maintenance_until"
            name="maintenance_until"
            type="date"
            defaultValue={datum ?? ""}
          />
        </div>

        <SaveButton />
      </form>
    </div>
  );
}
