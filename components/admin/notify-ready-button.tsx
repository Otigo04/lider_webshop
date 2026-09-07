"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { notifyOrderReady } from "@/lib/actions/admin-orders";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      <Mail className="size-4" aria-hidden />
      {pending ? "Wird verschickt …" : label}
    </Button>
  );
}

/**
 * Abholbereit-Mail noch einmal verschicken. Beim Umstellen auf „Abholbereit"
 * geht sie automatisch raus; dieser Knopf ist für den zweiten Anlauf, wenn sie
 * im Spamordner gelandet ist oder der Kunde sich nicht meldet. Er ändert
 * nichts am Status – sonst würde jedes Nachfassen den Vorgang neu datieren.
 */
export function NotifyReadyButton({
  orderId,
  bereitsGemeldet,
}: {
  orderId: string;
  bereitsGemeldet: boolean;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    notifyOrderReady,
    {},
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={orderId} />
      <SubmitButton
        label={bereitsGemeldet ? "Erneut benachrichtigen" : "Kunde benachrichtigen"}
      />
    </form>
  );
}
