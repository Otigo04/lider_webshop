"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface SortimentReiter {
  id: string;
  label: string;
  anzahl: number;
  /** Akzentfarbe 1–6 (lib/accent-colors.ts); null für „Alle" */
  farbe: number | null;
  /** Fertig gerenderte Karten – kommen aus der Server Component */
  karten: React.ReactNode[];
}

/**
 * Reiter über dem Sortiment-Querschnitt der Startseite: „Alle" plus eine
 * Warengruppe je Reiter.
 *
 * Die Karten rendert die Seite auf dem Server; hier wird nur umgeschaltet. So
 * kommen keine Artikeldaten als JSON in den Browser, und ohne JavaScript steht
 * wenigstens der erste Reiter da.
 */
export function SortimentTabs({ reiter }: { reiter: SortimentReiter[] }) {
  const [aktivId, setAktivId] = useState(reiter[0]?.id);
  const aktiv = reiter.find((eintrag) => eintrag.id === aktivId) ?? reiter[0];
  if (!aktiv) return null;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Warengruppe wählen"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {reiter.map((eintrag) => {
          const gewaehlt = eintrag.id === aktiv.id;
          return (
            <button
              key={eintrag.id}
              type="button"
              role="tab"
              id={`reiter-${eintrag.id}`}
              aria-selected={gewaehlt}
              aria-controls="sortiment-panel"
              onClick={() => setAktivId(eintrag.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200",
                gewaehlt
                  ? "border-surface-dark bg-surface-dark text-surface-dark-foreground shadow-md"
                  : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-sm",
              )}
            >
              {eintrag.farbe !== null ? (
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-full", `tag-dot-${eintrag.farbe}`)}
                />
              ) : null}
              {eintrag.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular",
                  gewaehlt ? "bg-white/15" : "bg-muted text-muted-foreground",
                )}
              >
                {eintrag.anzahl}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="sortiment-panel"
        role="tabpanel"
        aria-labelledby={`reiter-${aktiv.id}`}
        // key: beim Wechsel neu aufbauen, damit die Karten erneut auftreten.
        key={aktiv.id}
        className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
      >
        {aktiv.karten.map((karte, index) => (
          <div
            key={index}
            className="tab-item flex"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            {karte}
          </div>
        ))}
      </div>
    </div>
  );
}
