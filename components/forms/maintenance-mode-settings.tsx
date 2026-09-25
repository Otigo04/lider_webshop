"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMaintenanceMode } from "@/lib/actions/admin-settings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Ein Schalter, kein Formular: Wartungsmodus an/aus ist ein einzelnes Bit
 * (Migration 041), das sofort beim Klicken greift – kein Speichern-Knopf,
 * an dem eine halb umgeschaltete Seite hängen bleiben könnte.
 */
export function MaintenanceModeSettings({ aktiv: initial }: { aktiv: boolean }) {
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

  return (
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
          Unregistrierte Besucher sehen statt der Seiten den
          Wartungsscreen (/wartung). Bestandskunden und Admin melden sich
          weiterhin ganz normal über /login an und sehen den echten Shop.
          Neuanmeldungen über /register sind währenddessen ausgesetzt.
        </p>
      </div>
    </div>
  );
}
