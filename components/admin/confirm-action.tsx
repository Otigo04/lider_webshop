"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Action = (
  state: AdminFormState,
  formData: FormData,
) => Promise<AdminFormState>;

interface ConfirmActionProps {
  action: Action;
  /** Felder, die mit abgeschickt werden (z. B. { id }) */
  fields: Record<string, string>;
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
}

/**
 * Rückfrage vor einer Aktion, die sich nicht ohne Weiteres rückgängig machen
 * lässt. Bewusst als Dialog statt window.confirm – das blockiert sonst den
 * gesamten Browser-Tab.
 *
 * Die Aktion wird direkt in einer Transition aufgerufen statt über
 * useActionState. So lässt sich der Dialog im Ergebnis-Handler schließen,
 * ohne dafür setState in einem Effect aufzurufen.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      formData.set(name, value);
    }

    startTransition(async () => {
      const result = await action({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.success) toast.success(result.success);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "Läuft …" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
