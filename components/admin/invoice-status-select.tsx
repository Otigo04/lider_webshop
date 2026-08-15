"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateInvoiceStatus } from "@/lib/actions/admin-orders";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "…" : "Übernehmen"}
    </Button>
  );
}

export function InvoiceStatusSelect({
  invoiceId,
  orderId,
  status,
}: {
  invoiceId: string;
  orderId: string;
  status: InvoiceStatus;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateInvoiceStatus,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={invoiceId} />
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor={`invoice-status-${invoiceId}`} className="sr-only">
        Rechnungsstatus
      </label>
      <select
        id={`invoice-status-${invoiceId}`}
        name="status"
        defaultValue={status}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((value) => (
          <option key={value} value={value}>
            {INVOICE_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <SaveButton />
    </form>
  );
}
