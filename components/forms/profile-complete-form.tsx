"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AddressFields } from "@/components/forms/address-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vervollstaendigeProfil, type FormState } from "@/lib/actions/account";
import type { AppUser } from "@/lib/types";

function Speichern() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Angaben speichern"}
    </Button>
  );
}

/** Pflichtangaben nachtragen; Vorbelegung aus dem, was der Admin schon erfasst hat. */
export function ProfilVervollstaendigenForm({
  user,
  weiter,
}: {
  user: AppUser;
  weiter: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    vervollstaendigeProfil,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="weiter" value={weiter} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company_name">Firma</Label>
          <Input
            id="company_name"
            name="company_name"
            defaultValue={user.company_name ?? ""}
            autoComplete="organization"
            required
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="full_name">Ansprechpartner</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={user.full_name ?? ""}
            autoComplete="name"
            required
            maxLength={120}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Rechnungsadresse</p>
        <AddressFields
          prefix="billing"
          required
          defaults={{
            street: user.billing_street,
            zip: user.billing_zip,
            city: user.billing_city,
            country: user.billing_country || "Deutschland",
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vat_id">USt-IdNr. (optional)</Label>
        <Input
          id="vat_id"
          name="vat_id"
          defaultValue={user.vat_id ?? ""}
          maxLength={40}
          placeholder="DE123456789"
        />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="gewerbe" name="gewerbe" required className="mt-0.5" />
        <Label htmlFor="gewerbe" className="font-normal leading-snug">
          Ich bestelle als Gewerbetreibender. Die Preise im Shop sind
          Nettopreise für Unternehmen.
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

      <Speichern />
    </form>
  );
}
