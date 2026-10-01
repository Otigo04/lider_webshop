"use client";

import { useEffect, useRef, useState } from "react";
import { PreisschildVorschau } from "@/components/admin/preisschild-vorschau";
import {
  RAND,
  SEITE,
  raster,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";

/**
 * Ein belegter Platz auf dem Bogen.
 *
 * `eintragId` statt eines Listenindex: ein Eintrag mit Stückzahl 20 belegt
 * zwanzig Plätze, und ein Klick auf den achtzehnten soll denselben Eintrag
 * bearbeiten wie ein Klick auf den ersten.
 */
export interface BogenPlatz {
  eintragId: string;
  schild: Preisschild;
}

/**
 * Der A4-Bogen auf dem Bildschirm, verkleinert.
 *
 * Das Gegenstück zum Druckbogen (lib/preisschild-bogen.ts): dieselben
 * Schilder im selben Raster, nur maßstäblich geschrumpft. Gezeichnet werden
 * sie von derselben Komponente wie die Einzelvorschau, damit der Bogen keine
 * zweite Darstellung desselben Schilds ist.
 *
 * Verkleinert über `transform: scale()` und nicht über kleinere Maßangaben:
 * die Schildrechnung arbeitet in Millimetern, und ein zweiter Satz Zahlen für
 * die Bildschirmansicht liefe früher oder später neben dem Papier her. Der
 * Maßstab wird gemessen, nicht geraten – eine Hülle in Millimetern sagt dem
 * Skript, wie viele Pixel ein A4-Blatt hier breit ist.
 */
export function PreisschildBogenVorschau({
  plaetze,
  format,
  barcodePlatz,
  aktiv,
  onWaehlen,
}: {
  plaetze: BogenPlatz[];
  format: SchildFormat;
  barcodePlatz: boolean;
  /** Eintrag, der gerade bearbeitet wird – seine Plätze werden hervorgehoben. */
  aktiv: string | null;
  onWaehlen: (eintragId: string) => void;
}) {
  const huelle = useRef<HTMLDivElement>(null);
  const massstab = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0);

  useEffect(() => {
    const h = huelle.current;
    const m = massstab.current;
    if (!h || !m) return;

    const messen = () => {
      const blatt = m.offsetWidth;
      if (!blatt) return;
      // Nie über 1: ein A4-Bogen größer als lebensgroß zu zeigen hilft
      // niemandem und macht aus der Vorschau eine Lupe.
      setSkala(Math.min(1, h.clientWidth / blatt));
    };

    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(h);
    return () => beobachter.disconnect();
  }, []);

  const r = raster(format);
  const seiten: BogenPlatz[][] = [];
  for (let start = 0; start < plaetze.length; start += r.proBogen) {
    seiten.push(plaetze.slice(start, start + r.proBogen));
  }
  // Ein leerer Bogen wird gezeigt, nicht verschwiegen: er sagt, wie viele
  // Plätze das gewählte Format hat, bevor das erste Schild darauf liegt.
  if (seiten.length === 0) seiten.push([]);

  return (
    <div ref={huelle} className="min-w-0">
      {/* Maßstab: ein Millimetermaß, aus dem das Skript die Pixelbreite liest. */}
      <div
        ref={massstab}
        aria-hidden
        style={{ width: `${SEITE.breite}mm`, height: 0 }}
      />

      <div className="space-y-4">
        {seiten.map((seite, index) => (
          <figure key={index} className="m-0 space-y-1">
            <div
              className="relative overflow-hidden border border-border bg-white shadow-sm"
              style={{
                width: `calc(${SEITE.breite}mm * ${skala})`,
                height: `calc(${SEITE.hoehe}mm * ${skala})`,
              }}
            >
              {skala > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: `${SEITE.breite}mm`,
                    height: `${SEITE.hoehe}mm`,
                    padding: `${RAND}mm`,
                    transform: `scale(${skala})`,
                    transformOrigin: "top left",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${r.spalten}, ${format.breite}mm)`,
                      gridAutoRows: `${format.hoehe}mm`,
                    }}
                  >
                    {Array.from({ length: r.proBogen }, (_, platz) => {
                      const belegt = seite[platz];
                      if (!belegt) {
                        return (
                          <div
                            key={platz}
                            className="border border-dashed border-border/70"
                            aria-hidden
                          />
                        );
                      }
                      return (
                        <button
                          key={platz}
                          type="button"
                          onClick={() => onWaehlen(belegt.eintragId)}
                          aria-label={`„${belegt.schild.name}" bearbeiten`}
                          className="relative block cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
                        >
                          <PreisschildVorschau
                            schild={belegt.schild}
                            format={format}
                            barcodePlatz={barcodePlatz}
                          />
                          {/*
                           * Hervorhebung als eigene Ebene über dem Schild:
                           * ein Rahmen am Schild selbst nähme ihm Innenfläche,
                           * und dann stünde die Bezeichnung in der Vorschau
                           * anders als auf dem Papier.
                           */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0"
                            style={{
                              boxShadow:
                                aktiv === belegt.eintragId
                                  ? "inset 0 0 0 0.8mm var(--brand)"
                                  : undefined,
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <figcaption className="text-xs text-muted-foreground tabular">
              Bogen {index + 1} von {seiten.length} · {seite.length} von{" "}
              {r.proBogen} Plätzen belegt
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
