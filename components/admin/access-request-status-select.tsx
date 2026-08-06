"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateAccessRequestStatus } from "@/lib/actions/admin-access-requests";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import {
  ACCESS_REQUEST_STATUS_LABELS,
  type AccessRequestStatus,
} from "@/lib/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "…" : "Übernehmen"}
    </Button>
  );
}

export function AccessRequestStatusSelect({
  requestId,
  status,
}: {
  requestId: string;
  status: AccessRequestStatus;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateAccessRequestStatus,
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
      <input type="hidden" name="id" value={requestId} />
      <label htmlFor={`status-${requestId}`} className="sr-only">
        Status
      </label>
      <select
        id={`status-${requestId}`}
        name="status"
        defaultValue={status}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {(Object.keys(ACCESS_REQUEST_STATUS_LABELS) as AccessRequestStatus[]).map(
          (value) => (
            <option key={value} value={value}>
              {ACCESS_REQUEST_STATUS_LABELS[value]}
            </option>
          ),
        )}
      </select>
      <SaveButton />
    </form>
  );
}
