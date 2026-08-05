"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  createCustomer,
  updateCustomer,
  type CustomerFormState,
} from "@/lib/actions/admin-customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppUser } from "@/lib/types";

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "Wird gespeichert …"
        : isEdit
          ? "Änderungen speichern"
          : "Konto anlegen"}
    </Button>
  );
}

export function CustomerForm({ customer }: { customer?: AppUser }) {
  const isEdit = Boolean(customer);
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    isEdit ? updateCustomer : createCustomer,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    // Beim Anlegen bleibt die Seite stehen, damit das Startpasswort lesbar ist.
    if (isEdit) router.push("/admin/customers");
    router.refresh();
  }, [state.success, isEdit, router]);

  return (
    <form action={formAction} className="space-y-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={customer?.email}
          required={!isEdit}
          disabled={isEdit}
          autoComplete="off"
        />
        {isEdit ? (
          <p className="text-xs text-muted-foreground">
            Die E-Mail ist zugleich der Anmeldename und lässt sich hier nicht
            ändern.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">Ansprechpartner</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={customer?.full_name ?? ""}
          required
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="company_name">Firma</Label>
        <Input
          id="company_name"
          name="company_name"
          defaultValue={customer?.company_name ?? ""}
          maxLength={120}
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

      {state.temporaryPassword ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
          <p className="font-medium text-warning">Startpasswort</p>
          <p className="mt-2 select-all rounded-md border border-border bg-background px-2 py-1 font-mono text-base">
            {state.temporaryPassword}
          </p>
          <p className="mt-2 text-muted-foreground">
            Wird nur jetzt angezeigt. Geben Sie es dem Kunden weiter – er kann es
            unter „Konto“ selbst ändern.
          </p>
        </div>
      ) : null}

      <div className="flex gap-3">
        <SubmitButton isEdit={isEdit} />
        {isEdit ? (
          <Button asChild variant="ghost">
            <Link href="/admin/customers">Abbrechen</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
