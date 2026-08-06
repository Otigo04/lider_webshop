"use client";

import { resetConsent } from "@/lib/consent";

/** Setzt die Cookie-Entscheidung zurück, damit das Banner wieder erscheint. */
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => resetConsent()}
      className="hover:text-surface-dark-foreground"
    >
      Cookie-Einstellungen
    </button>
  );
}
