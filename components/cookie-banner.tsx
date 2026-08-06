"use client";

import Link from "next/link";
import { acceptAllConsent, rejectMarketingConsent, useConsent } from "@/lib/consent";
import { Button } from "@/components/ui/button";

/**
 * Erscheint nur, solange marketing noch nicht entschieden ist (null).
 * Notwendige Cookies (Login) laufen immer und brauchen keine Einwilligung –
 * die Wahl hier betrifft ausschließlich künftige Marketing-Cookies.
 */
export function CookieBanner() {
  const { marketing, ready } = useConsent();

  if (!ready || marketing !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie-Einstellungen"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background px-4 py-4 shadow-[0_-1px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Wir setzen technisch notwendige Cookies für die Anmeldung immer.
          Mit Ihrer Einwilligung setzen wir zusätzlich Marketing-Cookies.
          Details in der{" "}
          <Link href="/datenschutz" className="underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" onClick={() => rejectMarketingConsent()}>
            Nur notwendige
          </Button>
          <Button onClick={() => acceptAllConsent()}>Alle akzeptieren</Button>
        </div>
      </div>
    </div>
  );
}
