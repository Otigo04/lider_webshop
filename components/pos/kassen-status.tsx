"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgePlus,
  CheckCircle2,
  CircleAlert,
  PackageSearch,
  ScanBarcode,
  TriangleAlert,
} from "lucide-react";
import { useKassenTon, type KassenSignal } from "@/components/pos/use-kassen-ton";
import { cn } from "@/lib/utils";

/**
 * Statusleiste über dem Bon – die Sichtseite dessen, was der Ton meldet.
 *
 * Am Tresen steht der Bildschirm oft schräg und immer außerhalb des Blicks,
 * der auf der Ware liegt. Wer hinsieht, soll den letzten Vorgang in einem
 * Zug erfassen: Farbe, Zeichen, ein Satz. Eine kurz aufblitzende Meldung am
 * Bildschirmrand wäre dafür der falsche Ort – sie ist weg, bevor jemand
 * hinschaut.
 *
 * Die Leiste steht immer da, auch ohne Vorgang („Bereit"). Eine Leiste, die
 * kommt und geht, würde den Bon bei jedem Scan verschieben.
 */

export interface KassenMeldung {
  art: KassenSignal;
  text: string;
  /** Zweite Zeile: Artikelnummer, Bestand, Belegnummer */
  detail?: string;
}

/** Wie lange eine Meldung stehen bleibt, bevor wieder „Bereit" erscheint. */
const STANDZEIT = 8000;

const DARSTELLUNG: Record<
  KassenSignal,
  { label: string; klasse: string; Icon: typeof CheckCircle2 }
> = {
  treffer: {
    label: "Gebucht",
    klasse: "border-success/40 bg-success/10 text-success",
    Icon: CheckCircle2,
  },
  unbekannt: {
    label: "Unbekannt",
    klasse: "border-gold/50 bg-gold-soft text-gold",
    Icon: PackageSearch,
  },
  neu: {
    label: "Neu angelegt",
    klasse: "border-brand/40 bg-brand-soft text-brand",
    Icon: BadgePlus,
  },
  warnung: {
    label: "Achtung",
    klasse: "border-warning/50 bg-warning/10 text-warning",
    Icon: TriangleAlert,
  },
  fehler: {
    label: "Fehler",
    klasse: "border-destructive/50 bg-destructive/10 text-destructive",
    Icon: CircleAlert,
  },
  abschluss: {
    label: "Abgeschlossen",
    klasse: "border-success/50 bg-success/15 text-success",
    Icon: CheckCircle2,
  },
};

export function KassenStatus({
  meldung,
  bereitText = "Nächsten Artikel scannen.",
  className,
}: {
  meldung: KassenMeldung | null;
  bereitText?: string;
  className?: string;
}) {
  const zeigen = meldung
    ? DARSTELLUNG[meldung.art]
    : {
        label: "Bereit",
        klasse: "border-border bg-muted text-muted-foreground",
        Icon: ScanBarcode,
      };
  const { Icon } = zeigen;

  return (
    <div
      // polite statt assertive: der Vorleser soll den Kassierer nicht
      // unterbrechen, sondern nachziehen.
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors",
        zeigen.klasse,
        className,
      )}
    >
      <Icon className="size-6 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="eyebrow leading-none opacity-80">{zeigen.label}</p>
        <p className="mt-1 truncate font-semibold">
          {meldung ? meldung.text : bereitText}
        </p>
        {meldung?.detail ? (
          <p className="truncate text-sm opacity-80 tabular">{meldung.detail}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Meldung und Ton in einem Griff: `melden()` setzt die Leiste und spielt das
 * passende Signal. Getrennt zu führen hieße, an jeder Stelle beides zu
 * schreiben – und irgendwann klänge ein Fehler wie eine Buchung.
 */
export function useKassenMeldung() {
  const ton = useKassenTon();
  const [meldung, setMeldung] = useState<KassenMeldung | null>(null);
  const uhrRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (uhrRef.current) clearTimeout(uhrRef.current);
    },
    [],
  );

  const melden = useCallback(
    (art: KassenSignal, text: string, detail?: string) => {
      ton(art);
      setMeldung({ art, text, detail });
      if (uhrRef.current) clearTimeout(uhrRef.current);
      uhrRef.current = setTimeout(() => setMeldung(null), STANDZEIT);
    },
    [ton],
  );

  return { meldung, melden };
}
