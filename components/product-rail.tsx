"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Waagerechte Artikelreihe mit Blätter-Schaltflächen.
 *
 * Die Reihe ist immer per Wischen und Tastatur scrollbar; die Schaltflächen
 * sind eine Zugabe für die Maus und blenden sich aus, wenn alles ohnehin
 * sichtbar ist. Die Karten kommen als `children` aus einer Server Component,
 * hier läuft nur die Bedienung.
 */
export function ProductRail({
  children,
  label,
}: {
  children: React.ReactNode;
  /** Beschriftung für Screenreader, z. B. "Neuheiten" */
  label: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const messen = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const rest = track.scrollWidth - track.clientWidth - track.scrollLeft;
    setAtStart(track.scrollLeft <= 1);
    setAtEnd(rest <= 1);
  }, []);

  useEffect(() => {
    messen();
    const track = trackRef.current;
    if (!track) return;

    const observer = new ResizeObserver(messen);
    observer.observe(track);
    return () => observer.disconnect();
  }, [messen]);

  function blaettern(richtung: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({
      left: richtung * track.clientWidth * 0.85,
      behavior: ruhig ? "auto" : "smooth",
    });
  }

  const alleSichtbar = atStart && atEnd;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={messen}
        // tabIndex, damit sich die Reihe auch per Tastatur scrollen lässt –
        // sonst wären Karten außerhalb des Sichtbereichs nur per Tab-Sprung
        // erreichbar.
        tabIndex={0}
        role="group"
        aria-label={label}
        // overflow-y explizit dicht: sobald eine Achse scrollbar ist, wird die
        // andere laut CSS-Spec ebenfalls scrollbar – die Reihe würde dann das
        // Mausrad abfangen, statt die Seite weiterscrollen zu lassen.
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      >
        {children}
      </div>

      {alleSichtbar ? null : (
        <div className="mt-4 flex justify-end gap-2">
          <RailButton
            onClick={() => blaettern(-1)}
            disabled={atStart}
            label={`${label} zurückblättern`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </RailButton>
          <RailButton
            onClick={() => blaettern(1)}
            disabled={atEnd}
            label={`${label} weiterblättern`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </RailButton>
        </div>
      )}
    </div>
  );
}

function RailButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-md border border-border transition-colors",
        disabled
          ? "text-muted-foreground/40"
          : "text-foreground hover:border-foreground hover:bg-foreground hover:text-background",
      )}
    >
      {children}
    </button>
  );
}
