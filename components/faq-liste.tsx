import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FaqFrage } from "@/lib/faq";

/**
 * Aufklappbare Fragenliste – dieselbe auf der Startseite und unter /faq.
 *
 * Aufgeklappt wird über <details>: kein Skript, funktioniert ohne JavaScript,
 * und die Suche im Browser findet auch zugeklappte Antworten. Ein eigenes
 * Akkordeon mit State müsste dafür alles offen rendern und wieder verstecken.
 */
export function FaqListe({
  fragen,
  className,
}: {
  fragen: FaqFrage[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {fragen.map(({ frage, antwort }) => (
        // Benannte Gruppe: die Liste steht auf der Startseite selbst in einem
        // aufklappbaren <details>. Mit einer namenlosen `group` drehte dessen
        // geöffneter Zustand auch alle Pfeile darin – zugeklappte Fragen sähen
        // dann offen aus.
        <details key={frage} className="group/frage">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            {frage}
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open/frage:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
            {antwort}
          </div>
        </details>
      ))}
    </div>
  );
}
