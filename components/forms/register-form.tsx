"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type SignUpState } from "@/lib/actions/auth";
import { AddressFields } from "@/components/forms/address-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Wird angelegt …" : "Konto anlegen"}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState<SignUpState, FormData>(signUp, {});
  const [abweichend, setAbweichend] = useState(false);

  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
      >
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/*
        Lockvogelfeld gegen Formularroboter: für Menschen unsichtbar und aus
        der Tab-Reihenfolge genommen. Ist es ausgefüllt, verwirft
        lib/actions/auth.ts die Anfrage – gleiches Muster wie bei der
        Zugangsanfrage.
      */}
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="website">Website (bitte frei lassen)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="company_name">Firma</Label>
        <Input id="company_name" name="company_name" required maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">Ansprechpartner</Label>
        <Input id="full_name" name="full_name" required maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      {/*
        Anschrift beim Anlegen und nicht erst im Konto: sie steht auf jeder
        Rechnung. Ohne sie erzeugte die erste Bestellung eine Rechnung ohne
        Empfängeranschrift.
      */}
      <fieldset className="space-y-4 border-t border-border pt-5">
        <legend className="text-sm font-medium">Rechnungsadresse</legend>
        <AddressFields prefix="billing" required />

        <div className="flex items-center gap-2">
          <Checkbox
            id="different_shipping"
            name="different_shipping"
            checked={abweichend}
            onCheckedChange={(checked) => setAbweichend(checked === true)}
          />
          <Label htmlFor="different_shipping" className="font-normal">
            Abweichende Lieferadresse
          </Label>
        </div>

        {abweichend ? (
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <p className="mb-3 text-sm font-medium">Lieferadresse</p>
            <AddressFields prefix="shipping" />
          </div>
        ) : null}
      </fieldset>

      <div className="space-y-2 border-t border-border pt-5">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p className="text-xs text-muted-foreground">Mindestens 10 Zeichen.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Passwort bestätigen</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>

      {/*
        Der Shop zeigt Nettopreise – die gelten gegenüber Gewerbetreibenden.
        Deshalb wird die Eigenschaft hier bestätigt und nicht nur nebenbei
        behauptet. Pflichtfeld, geprüft wird sie serverseitig in
        lib/actions/auth.ts.
      */}
      <div className="flex items-start gap-3">
        <Checkbox id="gewerbe" name="gewerbe" className="mt-0.5" required />
        <Label htmlFor="gewerbe" className="font-normal leading-relaxed">
          Ich bestelle als Gewerbetreibender. Alle Preise im Portal verstehen
          sich netto zzgl. gesetzlicher Umsatzsteuer.
        </Label>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
