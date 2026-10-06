"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { saveCondition } from "@/lib/actions/admin-vouchers";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomerCondition } from "@/lib/types";
import { cn } from "@/lib/utils";

const SCHNELLWAHL = [0, 3, 5, 10, 15];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Kondition speichern"}
    </Button>
  );
}

/**
 * Sonderkondition eines Kunden: Prozent auf alles. Gilt im Shop automatisch
 * bei jeder Bestellung (create_order, Migration 054) und steht als eigene
 * Zeile auf der Rechnung.
 */
export function ConditionForm({
  customerId,
  condition,
}: {
  customerId: string;
  condition: CustomerCondition | null;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(saveCondition, {});
  const [satz, setSatz] = useState(condition ? Number(condition.discount_percent) : 0);
  const router = useRouter();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="discount_percent" value={satz} />

      <div className="space-y-1.5">
        <Label>Rabatt auf alle Artikel</Label>
        <div className="flex flex-wrap items-center gap-2">
          <NumericInput
            value={satz}
            onChange={setSatz}
            dezimal
            aria-label="Rabatt in Prozent"
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">%</span>
          <div className="ml-2 flex gap-1">
            {SCHNELLWAHL.map((wert) => (
              <button
                key={wert}
                type="button"
                onClick={() => setSatz(wert)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium tabular transition-colors",
                  satz === wert
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/30",
                )}
              >
                {wert === 0 ? "keiner" : `${wert} %`}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Wird bei jeder Shop-Bestellung automatisch vom Warenwert abgezogen.
          Der Kunde sieht den Satz in Warenkorb und Bestellformular.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Grund (intern)</Label>
        <Input
          id="note"
          name="note"
          maxLength={500}
          defaultValue={condition?.note ?? ""}
          placeholder="z. B. Stammkunde seit 2019, Bekannter"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
