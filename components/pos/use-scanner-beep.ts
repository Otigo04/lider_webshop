"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Quittungston der Kasse – der kurze Piep, den man aus jedem Laden kennt.
 *
 * Er meldet genau eins: der Artikel steht auf dem Bon. Deshalb hängt er nicht
 * am Lesevorgang eines einzelnen Eingabewegs, sondern an der Buchung selbst –
 * Kamera, Handscanner, getippter Code und Namenssuche klingen gleich.
 *
 * Das Audioobjekt lebt so lange wie die Kasse. Eines pro Scan zu bauen würde
 * die Datei jedes Mal neu holen; der Ton käme dann zu spät, um noch als
 * Rückmeldung durchzugehen.
 */

/** Liegt in `public/`, wird also unter diesem Pfad ausgeliefert. */
const TONDATEI = "/sounds/scanner-beep.mp3";

export function useScannerBeep() {
  const tonRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const ton = new Audio(TONDATEI);
    ton.preload = "auto";
    tonRef.current = ton;
    return () => {
      ton.pause();
      tonRef.current = null;
    };
  }, []);

  return useCallback(() => {
    const ton = tonRef.current;
    if (!ton) return;
    // Zurückspulen: ohne das bliebe der nächste Artikel stumm, solange der
    // vorige Ton noch läuft.
    ton.currentTime = 0;
    // Scheitert die Wiedergabe – stummgeschaltetes Gerät, verweigerte
    // Tonausgabe –, wird trotzdem kassiert. Der Ton ist Rückmeldung, nicht
    // Teil des Vorgangs.
    void ton.play().catch(() => undefined);
  }, []);
}
