"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { cn } from "@/lib/utils";

/**
 * Status ändern, ohne die Zeile zu verlassen.
 *
 * Vorher: Auswahlfeld plus „Übernehmen"-Knopf, nur auf der Detailseite. In
 * einer Liste mit dreißig Bestellungen sind das zwei Klicks und ein
 * Seitenwechsel für eine Änderung, die eigentlich eine Auswahl ist. Jetzt
 * speichert die Auswahl selbst – auf einen Fehler hin springt das Feld zurück,
 * weil `value` aus den Serverdaten kommt und nicht aus lokalem State.
 *
 * Das Feld trägt die Farbe seines Status. Ein Auswahlfeld sieht dadurch aus
 * wie das Etikett, das es setzt – die Liste ist auf einen Blick sortierbar,
 * ohne eine zweite Spalte nur für die Farbe.
 */
export function StatusSelect<T extends string>({
  value,
  labels,
  styles,
  action,
  fields,
  ariaLabel,
  className,
}: {
  value: T;
  labels: Record<T, string>;
  /** Klassen je Status – Rahmen, Fläche, Schrift */
  styles: Record<T, string>;
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  /** Feste Formularfelder, z. B. { id, orderId } */
  fields: Record<string, string | undefined>;
  ariaLabel: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const id = useId();

  function aendern(neu: string) {
    if (neu === value) return;

    startTransition(async () => {
      const formData = new FormData();
      for (const [name, wert] of Object.entries(fields)) {
        if (wert !== undefined) formData.set(name, wert);
      }
      formData.set("status", neu);

      const ergebnis = await action({}, formData);
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      if (ergebnis.success) toast.success(ergebnis.success);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="sr-only">
        {ariaLabel}
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        onChange={(event) => aendern(event.target.value)}
        className={cn(
          "h-8 rounded-md border-2 px-2 text-sm font-medium disabled:opacity-60",
          styles[value],
          className,
        )}
      >
        {(Object.keys(labels) as T[]).map((option) => (
          <option key={option} value={option} className="bg-background text-foreground">
            {labels[option]}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden />
      ) : null}
    </span>
  );
}
