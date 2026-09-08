"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Unlink } from "lucide-react";
import { toast } from "sonner";
import { setProductGroup, updateProductGroup } from "@/lib/actions/groups";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProductGroup } from "@/lib/types";

function SpeichernButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Angebot speichern"}
    </Button>
  );
}

/**
 * Kopfdaten einer Artikelgruppe.
 *
 * Der Name steht im Sortiment über der Auswahl, die Beschreibung auf jeder
 * Artikelseite des Bündels. Beides wird hier zentral gepflegt – am einzelnen
 * Artikel stünde es sonst dreimal und liefe auseinander.
 *
 * Der Beschreibungstext wird beim Anlegen in jede Ausführung kopiert; wer ihn
 * hier ändert, ändert die Gruppe. Die Artikeltexte bleiben, wie sie sind –
 * eine Ausführung darf einen eigenen Hinweis tragen („nur solange Vorrat").
 */
export function GruppeKopf({ gruppe }: { gruppe: ProductGroup }) {
  const router = useRouter();
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateProductGroup,
    {},
  );

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state.success, router]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={gruppe.id} />

      <div className="space-y-2">
        <Label htmlFor="gruppe-name">Name des Angebots</Label>
        <Input
          id="gruppe-name"
          name="name"
          defaultValue={gruppe.name}
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gruppe-text">Beschreibung</Label>
        <Textarea
          id="gruppe-text"
          name="description"
          rows={4}
          maxLength={5000}
          defaultValue={gruppe.description ?? ""}
        />
      </div>

      <SpeichernButton />
    </form>
  );
}

/**
 * Eine Ausführung aus dem Bündel lösen.
 *
 * Der Artikel bleibt vollständig bestehen und steht danach wieder einzeln im
 * Sortiment – nur die Klammer fällt weg. Deshalb keine Rückfrage: es geht
 * nichts verloren, und derselbe Knopf am Artikel hängt ihn wieder an.
 */
export function AusfuehrungLoesen({
  productId,
  name,
}: {
  productId: string;
  name: string;
}) {
  const router = useRouter();

  async function loesen() {
    const ergebnis = await setProductGroup({ productId, groupId: null });
    if (ergebnis.error) {
      toast.error(ergebnis.error);
      return;
    }
    toast.success(`„${name}“ steht jetzt wieder einzeln im Sortiment.`);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title="Aus dem Angebot lösen"
      onClick={loesen}
    >
      <Unlink className="size-4" aria-hidden />
      <span className="sr-only">{name} aus dem Angebot lösen</span>
    </Button>
  );
}
