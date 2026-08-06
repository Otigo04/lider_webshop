"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitAccessRequest,
  type AccessRequestFormState,
} from "@/lib/actions/access-requests";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Wird gesendet …" : "Anfrage senden"}
    </Button>
  );
}

function AddressFieldGroup({ prefix }: { prefix: "billing" | "shipping" }) {
  const required = prefix === "billing";
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}_street`}>Straße und Hausnummer</Label>
        <Input
          id={`${prefix}_street`}
          name={`${prefix}_street`}
          required={required}
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}_zip`}>PLZ</Label>
        <Input
          id={`${prefix}_zip`}
          name={`${prefix}_zip`}
          required={required}
          maxLength={20}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}_city`}>Ort</Label>
        <Input
          id={`${prefix}_city`}
          name={`${prefix}_city`}
          required={required}
          maxLength={120}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}_country`}>Land</Label>
        <Input
          id={`${prefix}_country`}
          name={`${prefix}_country`}
          defaultValue="Deutschland"
          required={required}
          maxLength={80}
        />
      </div>
    </div>
  );
}

export function AccessRequestForm() {
  const [state, formAction] = useActionState<
    AccessRequestFormState,
    FormData
  >(submitAccessRequest, {});
  const [differentShipping, setDifferentShipping] = useState(false);

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
    <form action={formAction} className="space-y-8">
      <div>
        <p className="text-sm font-medium">Kontakt</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">Vorname</Label>
            <Input id="first_name" name="first_name" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Nachname</Label>
            <Input id="last_name" name="last_name" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_name">Firma</Label>
            <Input id="company_name" name="company_name" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" name="phone" type="tel" maxLength={50} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <p className="text-sm font-medium">Rechnungsadresse</p>
        <div className="mt-3">
          <AddressFieldGroup prefix="billing" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="different_shipping"
          name="different_shipping"
          checked={differentShipping}
          onCheckedChange={(checked) => setDifferentShipping(checked === true)}
        />
        <Label htmlFor="different_shipping" className="font-normal">
          Abweichende Lieferadresse
        </Label>
      </div>

      {differentShipping ? (
        <div className="border-t border-border pt-6">
          <p className="text-sm font-medium">Versandadresse</p>
          <div className="mt-3">
            <AddressFieldGroup prefix="shipping" />
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-6">
        <div className="space-y-2">
          <Label htmlFor="message">Nachricht (optional)</Label>
          <Textarea id="message" name="message" rows={3} maxLength={2000} />
        </div>
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
