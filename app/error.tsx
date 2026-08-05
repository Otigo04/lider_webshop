"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Auffangseite für Fehler beim Rendern. Zeigt bewusst keine technischen
 * Details – die stehen im Serverlog. Die digest-Kennung hilft beim Zuordnen,
 * falls ein Kunde anruft.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Da ist etwas schiefgelaufen
      </h1>
      <p className="mt-3 text-muted-foreground">
        Die Seite konnte nicht geladen werden. Bitte versuchen Sie es erneut.
        Bleibt der Fehler bestehen, melden Sie sich bei uns.
      </p>

      {error.digest ? (
        <p className="mt-4 text-xs text-muted-foreground tabular">
          Kennung: {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex justify-center gap-3">
        <Button type="button" onClick={reset}>
          Erneut versuchen
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Zur Startseite</Link>
        </Button>
      </div>
    </div>
  );
}
