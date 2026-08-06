"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changePassword,
  updateAddresses,
  updateProfile,
  type FormState,
} from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export function AddressForm({ user }: { user: AppUser }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateAddresses,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="billing_address">Rechnungsadresse</Label>
        <Textarea
          id="billing_address"
          name="billing_address"
          rows={4}
          maxLength={500}
          defaultValue={user.billing_address ?? ""}
          placeholder="Firma, Straße, PLZ Ort"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipping_address">Versandadresse</Label>
        <Textarea
          id="shipping_address"
          name="shipping_address"
          rows={4}
          maxLength={500}
          defaultValue={user.shipping_address ?? ""}
          placeholder="Firma, Straße, PLZ Ort"
        />
        <p className="text-xs text-muted-foreground">
          Wird im Bestellprozess als Vorschlag für die Lieferadresse
          verwendet.
        </p>
      </div>

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
