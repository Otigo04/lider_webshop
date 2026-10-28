"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Verweildauer auf einer Kachel, bis das große Bild kommt. */
export const VORSCHAU_KACHEL_MS = 3500;
/** In der Produktansicht sofort. */
export const VORSCHAU_SOFORT_MS = 0;

/** Finger: so lange mindestens gedrückt halten, sonst wäre jedes Antippen eine Vorschau. */
const TOUCH_MIN_MS = 350;
/** Finger, der sich weiter bewegt, scrollt – dann keine Vorschau. */
const BEWEGUNG_PX = 10;
/** Nach dem Loslassen einer Vorschau den folgenden Klick verschlucken. */
const KLICK_SPERRE_MS = 500;

/**
 * Foto groß als Vorschau, wenn man darauf verweilt – wie bei Amazon.
 *
 * - **Maus:** Zeiger bleibt `verzoegerung` ms auf dem Bild, dann erscheint das
 *   große Foto in der Bildschirmmitte. Verlässt der Zeiger das Bild, scrollt die
 *   Seite oder drückt man Escape, ist es wieder weg. Die Vorschau fängt keine
 *   Mausereignisse ab: Klick, Hover und Link darunter verhalten sich wie sonst.
 * - **Finger:** gedrückt halten (mindestens 350 ms, sonst `verzoegerung`). Die
 *   Vorschau steht, solange der Finger liegt, und verschwindet beim Loslassen.
 *   Der Klick danach wird verschluckt, damit man nicht versehentlich in die
 *   Produktseite springt. Wischt der Finger, wird abgebrochen.
 * - Das große Bild wird schon beim Draufzeigen geladen (versteckt), nicht erst,
 *   wenn die Vorschau auftaucht. In der Produktansicht (`vorladen`) von Anfang
 *   an: dort soll nichts mehr warten.
 */
export function BildVorschau({
  src,
  alt,
  verzoegerung,
  vorladen = false,
  className,
  children,
}: {
  /** Ohne Bild bleibt der Rahmen ein normales div. */
  src: string | null | undefined;
  alt: string;
  verzoegerung: number;
  vorladen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [bereit, setBereit] = useState(vorladen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const finger = useRef(false);
  const klickSperre = useRef(false);

  const planen = useCallback(
    (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      if (ms <= 0) {
        setOffen(true);
        return;
      }
      timer.current = setTimeout(() => setOffen(true), ms);
    },
    [],
  );

  const beenden = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOffen(false);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Mit offener Vorschau: Escape oder Scrollen schließt sie.
  useEffect(() => {
    if (!offen) return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") beenden();
    };
    window.addEventListener("keydown", beiTaste);
    window.addEventListener("scroll", beenden, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", beiTaste);
      window.removeEventListener("scroll", beenden, { capture: true });
    };
  }, [offen, beenden]);

  if (!src) return <div className={className}>{children}</div>;

  return (
    <div
      className={className}
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        setBereit(true);
        planen(verzoegerung);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        beenden();
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        finger.current = true;
        setBereit(true);
        start.current = { x: e.clientX, y: e.clientY };
        planen(Math.max(verzoegerung, TOUCH_MIN_MS));
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "touch" || !start.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        if (Math.hypot(dx, dy) > BEWEGUNG_PX) beenden();
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "touch") return;
        if (offen) {
          // Die Vorschau war zu sehen: der Klick, der gleich folgt, gehört ihr.
          klickSperre.current = true;
          setTimeout(() => (klickSperre.current = false), KLICK_SPERRE_MS);
        }
        start.current = null;
        beenden();
      }}
      onPointerCancel={() => {
        start.current = null;
        beenden();
      }}
      onClickCapture={(e) => {
        if (klickSperre.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      // Langes Drücken öffnet sonst das Kontextmenü des Browsers (Bild/Link
      // speichern) und nimmt der Vorschau den Finger weg.
      onContextMenu={(e) => {
        if (finger.current) e.preventDefault();
      }}
      style={{ WebkitTouchCallout: "none" }}
    >
      {children}
      {bereit && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden
              className={cn(
                "pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4",
                "transition-opacity duration-150 motion-reduce:transition-none",
                offen ? "opacity-100" : "invisible opacity-0",
              )}
            >
              <div className="relative h-[min(85vh,900px)] w-[min(92vw,900px)] rounded-lg bg-white shadow-2xl">
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes="(min-width: 900px) 900px, 92vw"
                  className="object-contain p-4"
                  // Versteckt vorladen: lazy würde warten, bis die Vorschau sichtbar ist.
                  loading="eager"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
