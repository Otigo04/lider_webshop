"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { createOrderInvoice } from "@/lib/actions/admin-invoices";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird erzeugt …" : "Rechnung jetzt erzeugen"}
    </Button>
  );
}

/**
 * Notausgang für Bestellungen ohne Rechnung.
 *
 * Normalerweise entsteht die Rechnung automatisch beim Anlegen der Bestellung.
 * Scheitert das – Mailanbieter nicht erreichbar, Speicher weg, oder wie bei dem
 * Fehler aus Migration 024 –, stand die Bestellung bisher dauerhaft ohne
 * Rechnung da und ließ sich nur in der Datenbank retten. Ein zweiter Klick
 * legt keine zweite Nummer an: create_invoice_for_order gibt eine bestehende
 * Rechnung unverändert zurück.
 */
export function CreateInvoiceButton({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    createOrderInvoice,
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
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton />
    </form>
  );
}
