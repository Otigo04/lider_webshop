import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Zugriff auf die Logo-Dateien unter public/logo/.
 *
 * Es gibt drei Varianten derselben Marke, weil ein einziges Bild nicht überall
 * funktioniert:
 *   - logo.png       Lockup (Wappen über Schriftzug), quer – Impressum, Fußzeile
 *   - logo-mark.png  nur das Wappen, quadratisch – Kopfleiste, Kachel, Icon
 *   - logo-print.png kleine Fassung des Lockups für das Rechnungs-PDF
 *
 * Die unbeschnittene Originaldatei liegt als logo-original.png daneben und
 * wird nicht ausgeliefert.
 */

function vorhanden(...kandidaten: string[]): string | null {
  for (const datei of kandidaten) {
    if (existsSync(path.join(process.cwd(), "public", "logo", datei))) {
      return `/logo/${datei}`;
    }
  }
  return null;
}

/** Vollständiges Logo mit Schriftzug. */
export function getLogoPath(): string | null {
  return vorhanden("logo.svg", "logo.png");
}

/** Nur das Wappen – überall dort, wo eine quadratische Fläche gebraucht wird. */
export function getLogoMarkPath(): string | null {
  return vorhanden("logo-mark.svg", "logo-mark.png") ?? getLogoPath();
}

/** Absoluter Dateipfad der Druckfassung, für das Einbetten ins PDF. */
export function getLogoPrintFile(): string | null {
  for (const datei of ["logo-print.png", "logo.png"]) {
    const voll = path.join(process.cwd(), "public", "logo", datei);
    if (existsSync(voll)) return voll;
  }
  return null;
}

/** Seitenverhältnis der Lockup-Datei (900 × 685) für Breiten-/Höhenangaben. */
export const LOGO_ASPECT = 900 / 685;
