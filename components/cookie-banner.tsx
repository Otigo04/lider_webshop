"use client";

import Link from "next/link";
import { acceptAllConsent, rejectMarketingConsent, useConsent } from "@/lib/consent";
import { Button } from "@/components/ui/button";

/**
 * Erscheint nur, solange marketing noch nicht entschieden ist (null).
 * Notwendige Cookies (Login) laufen immer und brauchen keine Einwilligung –
 * die Wahl hier betrifft ausschließlich künftige Marketing-Cookies.
 *
 * Dunkler Hintergrund und Schatten bewusst kräftiger als der Rest der
 * Oberfläche: ein Banner, das man beim ersten Besuch übersieht, verfehlt
 * seinen Zweck.
 */
export function CookieBanner() {
  const { marketing, ready } = useConsent();

  if (!ready || marketing !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie-Einstellungen"
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-brand bg-surface-dark px-4 py-5 text-surface-dark-foreground shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-surface-dark-muted">
          Wir setzen technisch notwendige Cookies für die Anmeldung immer.
          Mit Ihrer Einwilligung setzen wir zusätzlich Marketing-Cookies.
          Details in der{" "}
          <Link href="/datenschutz" className="text-surface-dark-foreground underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <Button
            variant="outline"
            className="border-surface-dark-border bg-transparent text-surface-dark-foreground hover:bg-white/10 hover:text-surface-dark-foreground"
            onClick={() => rejectMarketingConsent()}
          >
            Nur notwendige
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand-hover"
            onClick={() => acceptAllConsent()}
          >
            Alle akzeptieren
          </Button>
        </div>
      </div>
    </div>
  );
}
