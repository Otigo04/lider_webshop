"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { acceptAllConsent, rejectMarketingConsent, useConsent } from "@/lib/consent";
import { Button } from "@/components/ui/button";

/**
 * Erscheint nur, solange marketing noch nicht entschieden ist (null).
 * Notwendige Cookies (Login) laufen immer und brauchen keine Einwilligung –
 * die Wahl hier betrifft ausschließlich künftige Marketing-Cookies.
 *
 * Bewusst als abgedunkelte Fläche mit Karte darüber statt als schmaler
 * Streifen am Rand: ein Banner, das beim ersten Besuch übersehen wird,
 * verfehlt seinen Zweck – und eine Einwilligung, die niemand bewusst gibt,
 * ist keine. Der Hintergrund wird nur abgedunkelt, nicht blockiert: die Seite
 * bleibt lesbar und scrollbar, weil Ablehnen sonst der bequemste Weg wäre,
 * das Bild wieder freizubekommen.
 *
 * Beide Knöpfe sind gleich groß und gleich auffällig. Ein zurückgenommenes
 * „Nur notwendige" neben einem leuchtenden „Alle akzeptieren" wäre nach
 * DSGVO-Maßstab keine freie Wahl.
 */
export function CookieBanner() {
  const { marketing, ready } = useConsent();

  if (!ready || marketing !== null) return null;

  return (
    <>
      {/* Reine Abdunkelung, kein Klickfänger: ein Klick daneben darf keine
          stillschweigende Zustimmung sein. */}
      <div
        aria-hidden
        className="consent-backdrop pointer-events-none fixed inset-0 z-50 bg-black/55"
      />

      <div
        role="dialog"
        aria-labelledby="cookie-titel"
        aria-describedby="cookie-text"
        className="consent-panel fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
      >
        <div className="mx-auto max-w-3xl rounded-lg border-2 border-gold bg-surface-dark p-5 text-surface-dark-foreground shadow-[0_12px_48px_rgba(0,0,0,0.55)] sm:p-6">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gold text-gold-foreground"
            >
              <Cookie className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="cookie-titel" className="text-lg font-semibold">
                Cookies auf dieser Seite
              </h2>
              <p
                id="cookie-text"
                className="mt-2 text-sm leading-relaxed text-surface-dark-muted"
              >
                Technisch notwendige Cookies für die Anmeldung setzen wir
                immer. Marketing-Cookies nur mit Ihrer Einwilligung. Ihre
                Entscheidung können Sie jederzeit über „Cookie-Einstellungen"
                in der Fußzeile ändern – Einzelheiten in der{" "}
                <Link
                  href="/datenschutz"
                  className="font-medium text-surface-dark-foreground underline underline-offset-2 hover:text-gold-bright"
                >
                  Datenschutzerklärung
                </Link>
                .
              </p>
            </div>
          </div>

          {/* Gleiche Breite, gleiche Größe: die Wahl soll offen aussehen. */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              variant="outline"
              className="flex-1 border-surface-dark-border bg-transparent text-base font-semibold text-surface-dark-foreground hover:bg-white/10 hover:text-surface-dark-foreground"
              onClick={() => rejectMarketingConsent()}
            >
              Nur notwendige
            </Button>
            <Button
              size="lg"
              className="flex-1 bg-gold text-base font-semibold text-gold-foreground hover:bg-gold/85"
              onClick={() => acceptAllConsent()}
            >
              Alle akzeptieren
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
