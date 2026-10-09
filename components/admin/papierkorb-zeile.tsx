"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { purgeDeletedProduct, restoreProduct } from "@/lib/actions/admin-products";

/** Knöpfe einer Zeile im Papierkorb: zurückholen oder endgültig löschen. */
export function PapierkorbKnoepfe({ id, name }: { id: string; name: string }) {
  const [laeuft, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={laeuft}
        onClick={() =>
          start(async () => {
            const ergebnis = await restoreProduct(id);
            if (ergebnis.error) toast.error(ergebnis.error);
            else toast.success(`„${name}“ ist wieder da.`);
            router.refresh();
          })
        }
      >
        <Undo2 className="size-4" aria-hidden /> Zurückholen
      </Button>
      <ConfirmAction
        action={purgeDeletedProduct}
        fields={{ id }}
        title={`„${name}“ endgültig löschen?`}
        description="Der Artikel und seine Fotos werden dauerhaft entfernt. Das lässt sich nicht rückgängig machen."
        confirmLabel="Endgültig löschen"
        destructive
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Endgültig löschen"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="sr-only">{name} endgültig löschen</span>
          </Button>
        }
      />
    </div>
  );
}
