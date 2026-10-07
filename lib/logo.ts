import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Zugriff auf die Logo-Dateien unter public/logo/.
 *
 * Es gibt drei Varianten derselben Marke, weil ein einziges Bild nicht überall
 * funktioniert:
 *   - logo_v1.png    Lockup (Wappen über Schriftzug, 1037 × 826) – Kopfleiste,
 *                    Impressum, Fußzeile, Anmeldeseiten
 *   - logo-mark.png  nur das Wappen, quadratisch – Kopfleiste, Kachel, Icon
 *   - logo-print.png kleine Fassung des Lockups für das Rechnungs-PDF
 *
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
  return vorhanden("logo_v1.png", "logo.svg", "logo.png");
}

/** Nur das Wappen – überall dort, wo eine quadratische Fläche gebraucht wird. */
export function getLogoMarkPath(): string | null {
  return vorhanden("logo-mark.svg", "logo-mark.png") ?? getLogoPath();
}

/** Nur der Schriftzug „LIDER", quer – Kopfleiste neben dem Wappen. */
export function getLogoWordmarkPath(): string | null {
  return vorhanden("logo-wordmark.svg", "logo-wordmark.png");
}

/** Absoluter Dateipfad der Druckfassung, für das Einbetten ins PDF. */
export function getLogoPrintFile(): string | null {
  for (const datei of ["logo-print.png", "logo_v1.png", "logo.png"]) {
    const voll = path.join(process.cwd(), "public", "logo", datei);
    if (existsSync(voll)) return voll;
  }
  return null;
}

/** Seitenverhältnis der Lockup-Datei (1037 × 826) für Breiten-/Höhenangaben. */
export const LOGO_ASPECT = 1037 / 826;

/** Seitenverhältnis der Wordmark-Datei (2400 × 603) für Breiten-/Höhenangaben. */
export const LOGO_WORDMARK_ASPECT = 2400 / 603;
