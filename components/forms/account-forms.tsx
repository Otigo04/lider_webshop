"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  changePassword,
  updateAddresses,
  updateProfile,
  type FormState,
} from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppUser } from "@/lib/types";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : label}
    </Button>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
      >
        {state.success}
      </p>
    );
  }
  return null;
}

export function ProfileForm({ user }: { user: AppUser }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateProfile,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">Name</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={user.full_name ?? ""}
          required
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="company_name">Firma</Label>
        <Input
          id="company_name"
          name="company_name"
          defaultValue={user.company_name ?? ""}
          maxLength={120}
        />
      </div>

      <Feedback state={state} />
      <SaveButton label="Stammdaten speichern" />
    </form>
  );
}

function AddressFieldGroup({
  prefix,
  defaults,
}: {
  prefix: "billing" | "shipping";
  defaults: {
    street: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}_street`}>Straße und Hausnummer</Label>
        <Input
          id={`${prefix}_street`}
          name={`${prefix}_street`}
          defaultValue={defaults.street ?? ""}
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}_zip`}>PLZ</Label>
        <Input
          id={`${prefix}_zip`}
          name={`${prefix}_zip`}
          defaultValue={defaults.zip ?? ""}
          maxLength={20}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}_city`}>Ort</Label>
        <Input
          id={`${prefix}_city`}
          name={`${prefix}_city`}
          defaultValue={defaults.city ?? ""}
          maxLength={120}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}_country`}>Land</Label>
        <Input
          id={`${prefix}_country`}
          name={`${prefix}_country`}
          defaultValue={defaults.country ?? "Deutschland"}
          maxLength={80}
        />
      </div>
    </div>
  );
}

function hasShippingAddress(user: AppUser): boolean {
  return Boolean(
    user.shipping_street || user.shipping_zip || user.shipping_city,
  );
}

function shippingDiffersFromBilling(user: AppUser): boolean {
  return (
    (user.shipping_street ?? "") !== (user.billing_street ?? "") ||
    (user.shipping_zip ?? "") !== (user.billing_zip ?? "") ||
    (user.shipping_city ?? "") !== (user.billing_city ?? "")
  );
}

export function AddressForm({ user }: { user: AppUser }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateAddresses,
    {},
  );
  const [differentShipping, setDifferentShipping] = useState(
    () => hasShippingAddress(user) && shippingDiffersFromBilling(user),
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">Rechnungsadresse</p>
        <AddressFieldGroup
          prefix="billing"
          defaults={{
            street: user.billing_street,
            zip: user.billing_zip,
            city: user.billing_city,
            country: user.billing_country,
          }}
        />
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
        <div className="space-y-3">
          <p className="text-sm font-medium">Versandadresse</p>
          <AddressFieldGroup
            prefix="shipping"
            defaults={{
              street: user.shipping_street,
              zip: user.shipping_zip,
              city: user.shipping_city,
              country: user.shipping_country,
            }}
          />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Die Versandadresse wird im Bestellprozess als Vorschlag für die
        Lieferadresse verwendet – ohne Häkchen gilt die Rechnungsadresse.
      </p>

      <Feedback state={state} />
      <SaveButton label="Adressen speichern" />
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Neues Passwort</Label>
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
        <Label htmlFor="confirm">Wiederholen</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>

      <Feedback state={state} />
      <SaveButton label="Passwort ändern" />
    </form>
  );
}
