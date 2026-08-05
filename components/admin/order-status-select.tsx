"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateOrderStatus } from "@/lib/actions/admin-orders";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "…" : "Übernehmen"}
    </Button>
  );
}

export function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateOrderStatus,
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
      <input type="hidden" name="id" value={orderId} />
      <label htmlFor={`status-${orderId}`} className="sr-only">
        Bestellstatus
      </label>
      <select
        id={`status-${orderId}`}
        name="status"
        defaultValue={status}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
          <option key={value} value={value}>
            {ORDER_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <SaveButton />
    </form>
  );
}
