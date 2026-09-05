"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type SignUpState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
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

      <div className="space-y-2">
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
