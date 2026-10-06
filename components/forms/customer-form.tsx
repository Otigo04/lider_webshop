"use client";

import { StartPasswordBox } from "@/components/admin/start-password-box";
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
import { AddressFields } from "@/components/forms/address-fields";
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

export function CustomerForm({
  customer,
  zurueck = "/admin/customers",
}: {
  customer?: AppUser;
  /** Ziel nach dem Speichern einer Änderung */
  zurueck?: string;
}) {
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
    if (isEdit) router.push(zurueck);
    router.refresh();
  }, [state.success, isEdit, router, zurueck]);

  return (
    <form action={formAction} className="space-y-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      {/* Kundennummer vergibt die Datenbank (Migration 046) und steht auf
          gestellten Rechnungen – sie wird gezeigt, nicht bearbeitet. Ein
          Eingabefeld dafür wäre eine Einladung, eine Nummer zu ändern, die
          schon auf Papier steht. */}
      {customer?.customer_number ? (
        <div className="flex items-baseline justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">Kundennummer</span>
          <span className="tabular font-medium">{customer.customer_number}</span>
        </div>
      ) : null}

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

      <div className="space-y-2">
        <Label htmlFor="vat_id">USt-IdNr.</Label>
        <Input
          id="vat_id"
          name="vat_id"
          defaultValue={customer?.vat_id ?? ""}
          maxLength={40}
          placeholder="DE123456789"
        />
        <p className="text-xs text-muted-foreground">
          Nur nötig für Rechnungen ins EU-Ausland. Kann leer bleiben.
        </p>
      </div>

      {/*
        Anschrift auch hier, nicht nur im Kundenkonto: ein telefonisch
        angelegter Kunde meldet sich womöglich nie selbst an, und ohne Adresse
        entstünde eine Rechnung ohne Empfängeranschrift.
      */}
      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-medium">Rechnungsadresse</legend>
        <AddressFields
          prefix="billing"
          defaults={{
            street: customer?.billing_street,
            zip: customer?.billing_zip,
            city: customer?.billing_city,
            country: customer?.billing_country,
          }}
        />
        <p className="text-xs text-muted-foreground">
          Wird als Liefer- und Rechnungsadresse übernommen. Der Kunde kann sie
          im eigenen Konto ändern.
        </p>
      </fieldset>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {state.temporaryPassword ? (
        <StartPasswordBox
          title="Startpasswort"
          password={state.temporaryPassword}
          email={state.temporaryPasswordEmail}
        />
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
