"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendCustomerVerification } from "@/lib/actions/admin-customers";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";

function SubmitButton({ erneut }: { erneut: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sendet …" : erneut ? "Bestätigungsmail erneut senden" : "Bestätigungsmail senden"}
    </Button>
  );
}

/** Löst den Versand der Bestätigungsmail aus; erst danach kann der Kunde sein Konto freischalten. */
export function SendVerificationButton({
  customerId,
  erneut,
}: {
  customerId: string;
  erneut: boolean;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    sendCustomerVerification,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={customerId} />
      <SubmitButton erneut={erneut} />
      {state.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
