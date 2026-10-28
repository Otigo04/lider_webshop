"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { setNewsletter, type NewsletterState } from "@/lib/actions/account";

function Speichern() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </Button>
  );
}

/** Newsletter-Häkchen im Konto. Abmelden geht jederzeit, auch über den Link in jeder Mail. */
export function NewsletterForm({
  abonniert,
  code,
  anreiz,
}: {
  abonniert: boolean;
  /** Willkommensgutschein des Kontos, solange er einlösbar ist (Migration 076) */
  code?: string | null;
  /** „5 € Gutschein auf Ihre erste Bestellung ab 50 € …" für Konten, die noch nicht abonniert haben */
  anreiz?: string | null;
}) {
  const [state, formAction] = useActionState<NewsletterState, FormData>(setNewsletter, {});

  return (
    <form action={formAction} className="space-y-4">
      {code ? (
        <div className="rounded-md border border-gold/50 bg-gold-soft p-4">
          <p className="text-xs text-muted-foreground">Ihr Gutscheincode</p>
          <p className="code mt-1 text-lg font-semibold tracking-wider">{code}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {anreiz ? `${anreiz}. ` : ""}Im Warenkorb beim Bestellen eingeben.
          </p>
        </div>
      ) : !abonniert && anreiz ? (
        <p className="rounded-md border border-gold/50 bg-gold-soft px-4 py-3 text-sm">
          Neu im Newsletter: {anreiz}.
        </p>
      ) : null}
      <div className="flex items-start gap-3">
        <Checkbox id="newsletter" name="newsletter" defaultChecked={abonniert} className="mt-0.5" />
        <Label htmlFor="newsletter" className="font-normal leading-relaxed">
          Ich möchte den LIDER-Newsletter per E-Mail erhalten: Neuheiten, reduzierte
          Ware und Angebote. Ich kann ihn jederzeit hier oder über den Link in jeder
          Mail abbestellen.
        </Label>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {state.success}
        </p>
      ) : null}
      <Speichern />
    </form>
  );
}
