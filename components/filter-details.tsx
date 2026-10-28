"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const DESKTOP = "(min-width: 1024px)";

/**
 * Klappbare Filterspalte. Auf dem Handy startet sie eingeklappt, damit die
 * Ware zuerst kommt; ab Desktopbreite steht sie immer offen (dort gibt es
 * keine Kopfzeile zum Zuklappen).
 *
 * Ein Link in der Spalte (Warengruppe wechseln) klappt sie wieder zu, sonst
 * bliebe sie nach dem Wechsel über der Ware stehen. Das Formular lädt die
 * Seite neu und startet damit ohnehin eingeklappt.
 */
export function FilterDetails({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medien = window.matchMedia(DESKTOP);
    const abgleichen = () => {
      if (medien.matches) el.open = true;
    };
    abgleichen();
    medien.addEventListener("change", abgleichen);
    return () => medien.removeEventListener("change", abgleichen);
  }, []);

  return (
    <details
      ref={ref}
      className={cn("filter-details group", className)}
      onClick={(event) => {
        const ziel = event.target as HTMLElement;
        if (ziel.closest("a") && !window.matchMedia(DESKTOP).matches) {
          ref.current?.removeAttribute("open");
        }
      }}
    >
      {children}
    </details>
  );
}
