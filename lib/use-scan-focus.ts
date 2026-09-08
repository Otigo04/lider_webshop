"use client";

import { useEffect, type RefObject } from "react";

/**
 * Tastatur-Wächter für Handscanner.
 *
 * Ein USB-Handscanner meldet sich am Rechner als Tastatur an: er tippt den
 * Barcode blind los und schließt mit Enter ab, egal wo der Fokus gerade steht.
 * Steht er auf keinem Eingabefeld, verpuffen die Zeichen – der Kassierer
 * müsste erst mit der Maus ins Scannerfeld klicken.
 *
 * Der Wächter holt den Fokus beim ersten Zeichen dorthin zurück. Das Zeichen
 * geht nicht verloren: `keydown` läuft vor dem Einfügen, und beim
 * anschließenden `keypress` liegt der Fokus bereits im Feld.
 *
 * Wird an zwei Stellen gebraucht – Kasse und Wareneingang –, deshalb hier und
 * nicht in einer der beiden Oberflächen.
 */
export function useScanFocus(
  ziel: RefObject<HTMLInputElement | null>,
  /**
   * Aus, solange ein Dialog offen ist: dort tippt jemand von Hand, und ein
   * Wächter, der den Fokus wegzieht, macht das Formular unbenutzbar.
   */
  pausiert = false,
) {
  useEffect(() => {
    if (pausiert) return;

    function beiTaste(event: KeyboardEvent) {
      const wo = event.target as HTMLElement | null;
      if (
        wo &&
        (wo.tagName === "INPUT" ||
          wo.tagName === "TEXTAREA" ||
          wo.tagName === "SELECT" ||
          wo.isContentEditable)
      ) {
        return;
      }
      // Tastenkürzel bleiben Tastenkürzel; Sondertasten (Tab, Pfeile) sind
      // Bedienung, kein Barcode.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;

      ziel.current?.focus();
    }

    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [ziel, pausiert]);
}
