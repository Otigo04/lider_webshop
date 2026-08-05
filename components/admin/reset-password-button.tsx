"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { resetCustomerPassword } from "@/lib/actions/admin-customers";
import type { CustomerFormState } from "@/lib/actions/admin-customers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Läuft …" : "Neues Passwort erzeugen"}
    </Button>
  );
}

/**
 * Eigener Dialog statt ConfirmAction, weil das erzeugte Passwort im Ergebnis
 * steht und sichtbar bleiben muss, bis der Admin es weitergegeben hat.
 */
export function ResetPasswordButton({
  customerId,
  email,
}: {
  customerId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    resetCustomerPassword,
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Passwort
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Passwort zurücksetzen</DialogTitle>
          <DialogDescription>
            Setzt ein neues Startpasswort für {email}. Das bisherige Passwort
            gilt danach nicht mehr.
          </DialogDescription>
        </DialogHeader>

        {state.temporaryPassword ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
            <p className="font-medium text-warning">Neues Startpasswort</p>
            <p className="mt-2 select-all rounded-md border border-border bg-background px-2 py-1 font-mono text-base">
              {state.temporaryPassword}
            </p>
            <p className="mt-2 text-muted-foreground">
              Wird nur jetzt angezeigt.
            </p>
          </div>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="id" value={customerId} />
            {state.error ? (
              <p
                role="alert"
                className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {state.error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Abbrechen
              </Button>
              <ConfirmButton />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
