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

export function AccessRequestForm() {
  const [state, formAction] = useActionState<
    AccessRequestFormState,
    FormData
  >(submitAccessRequest, {});
  const [sameAddress, setSameAddress] = useState(true);

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
    <form action={formAction} className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="company_name">Firma</Label>
        <Input id="company_name" name="company_name" required maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact_name">Ansprechpartner</Label>
        <Input id="contact_name" name="contact_name" required maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefon</Label>
        <Input id="phone" name="phone" type="tel" maxLength={50} />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="billing_address">Rechnungsadresse</Label>
        <Textarea
          id="billing_address"
          name="billing_address"
          rows={3}
          maxLength={500}
          required
          placeholder="Firma, Straße, PLZ Ort"
        />
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id="same_address"
          name="same_address"
          checked={sameAddress}
          onCheckedChange={(checked) => setSameAddress(checked === true)}
        />
        <Label htmlFor="same_address" className="font-normal">
          Versandadresse identisch mit Rechnungsadresse
        </Label>
      </div>

      {sameAddress ? null : (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="shipping_address">Versandadresse</Label>
          <Textarea
            id="shipping_address"
            name="shipping_address"
            rows={3}
            maxLength={500}
            required
            placeholder="Firma, Straße, PLZ Ort"
          />
        </div>
      )}

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="message">Nachricht</Label>
        <Textarea id="message" name="message" rows={3} maxLength={2000} />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2"
        >
          {state.error}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
