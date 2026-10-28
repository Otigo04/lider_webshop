"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { abonniereNewsletter, type NewsletterState } from "@/lib/actions/account";

function Knopf() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Wird gespeichert …" : "Newsletter abonnieren"}
    </Button>
  );
}

/**
 * Ein Klick für angemeldete Kunden. Der Text daneben ist die Einwilligung;
 * abbestellen geht im Konto und über den Link in jeder Mail.
 */
export function NewsletterAbonnieren() {
  const [state, formAction] = useActionState<NewsletterState, FormData>(abonniereNewsletter, {});

  return (
    <form action={formAction} className="space-y-3">
      <Knopf />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Mit dem Klick willige ich ein, den LIDER-Newsletter an die E-Mail-Adresse meines Kontos
        zu erhalten. Abbestellen geht jederzeit im Konto oder über den Link in jeder Mail. Mehr in
        der{" "}
        <Link href="/datenschutz" className="underline">
          Datenschutzerklärung
        </Link>
        .
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
