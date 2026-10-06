"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Slide {
  id: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  href: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  tone: "dark" | "light";
}

const RUHIG = "(prefers-reduced-motion: reduce)";
function abonniereRuhig(melden: () => void) {
  const mq = window.matchMedia(RUHIG);
  mq.addEventListener("change", melden);
  return () => mq.removeEventListener("change", melden);
}
function istRuhig() {
  return window.matchMedia(RUHIG).matches;
}

/** Anzeigedauer je Bild. Lang genug für Überschrift plus Unterzeile. */
const DAUER_MS = 6500;

/**
 * Werbebilder oben auf der Startseite.
 *
 * Bewusst schlicht: Überblenden statt Schieben oder Zoomen, ein Text-Block
 * links auf einem Verlauf, Pfeile und Punkte. So sehen die Aktionsflächen der
 * großen Großhändler aus – das Bild ist die Botschaft, nicht die Animation.
 *
 * - Hält an bei Mauszeiger oder Tastaturfokus im Slider, und auf Knopfdruck
 *   (Pause ist für bewegte Inhalte eine WCAG-Anforderung, 2.2.2).
 * - Bei `prefers-reduced-motion` kein automatischer Wechsel und kein Blenden.
 * - Wischen auf dem Telefon, Pfeiltasten auf der Tastatur.
 * - Läuft im Hintergrund-Tab nicht weiter.
 * - Ein einzelnes Bild ist ein Banner: keine Pfeile, keine Punkte.
 */
export function HomeSlider({ slides }: { slides: Slide[] }) {
  const [aktiv, setAktiv] = useState(0);
  const [pausiert, setPausiert] = useState(false);
  const [schwebt, setSchwebt] = useState(false);
  const ruhig = useSyncExternalStore(abonniereRuhig, istRuhig, () => false);
  const wischStart = useRef<number | null>(null);
  const anzahl = slides.length;
  const mehrere = anzahl > 1;

  const gehe = useCallback(
    (ziel: number) => setAktiv(((ziel % anzahl) + anzahl) % anzahl),
    [anzahl],
  );

  const laeuft = mehrere && !pausiert && !schwebt && !ruhig;

  useEffect(() => {
    if (!laeuft) return;
    const zeitgeber = window.setInterval(() => {
      if (document.visibilityState === "visible") setAktiv((a) => (a + 1) % anzahl);
    }, DAUER_MS);
    return () => window.clearInterval(zeitgeber);
  }, [laeuft, anzahl, aktiv]);

  if (anzahl === 0) return null;

  return (
    <section
      aria-roledescription="Karussell"
      aria-label="Aktuelle Angebote"
      className="relative isolate overflow-hidden bg-surface-dark"
      onMouseEnter={() => setSchwebt(true)}
      onMouseLeave={() => setSchwebt(false)}
      onFocusCapture={() => setSchwebt(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSchwebt(false);
      }}
      onKeyDown={(e) => {
        if (!mehrere) return;
        if (e.key === "ArrowLeft") gehe(aktiv - 1);
        if (e.key === "ArrowRight") gehe(aktiv + 1);
      }}
      onTouchStart={(e) => {
        wischStart.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = wischStart.current;
        wischStart.current = null;
        if (start == null || !mehrere) return;
        const weg = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(weg) > 40) gehe(aktiv + (weg < 0 ? 1 : -1));
      }}
    >
      {/* Höhe: Telefon fast quadratisch (6:5), ab Tablet breites Band (3:1). */}
      <div className="relative aspect-[6/5] w-full sm:aspect-[21/8] lg:aspect-[3/1] lg:max-h-[30rem]">
        {slides.map((slide, index) => {
          const sichtbar = index === aktiv;
          const hell = slide.tone === "light";
          const hatText = Boolean(slide.title || slide.subtitle);
          const inhalt = (
            <>
              {/* Zwei Bilder statt art direction per <picture>: next/image
                  optimiert beide, das Telefonbild lädt nur unter sm. */}
              <Image
                src={slide.imageUrl}
                alt={slide.title ?? ""}
                fill
                priority={index === 0}
                sizes="100vw"
                className={cn("object-cover", slide.mobileImageUrl && "hidden sm:block")}
              />
              {slide.mobileImageUrl ? (
                <Image
                  src={slide.mobileImageUrl}
                  alt={slide.title ?? ""}
                  fill
                  priority={index === 0}
                  sizes="100vw"
                  className="object-cover sm:hidden"
                />
              ) : null}

              {hatText ? (
                <>
                  {/* Verlauf nur hinter dem Text – der Rest des Bildes bleibt
                      unangetastet. Auf dem Telefon von unten, sonst von links. */}
                  <div
                    aria-hidden
                    className={cn(
                      "absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r",
                      hell
                        ? "from-white/90 via-white/60 to-transparent sm:via-white/50"
                        : "from-black/75 via-black/40 to-transparent sm:from-black/65 sm:via-black/30",
                    )}
                  />
                  <div className="absolute inset-0 flex items-end sm:items-center">
                    <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:pb-0">
                      <div
                        className={cn(
                          "max-w-md lg:max-w-lg",
                          hell ? "text-foreground" : "text-white",
                        )}
                      >
                        <span aria-hidden className="mb-3 block h-1 w-12 rounded-full bg-gold" />
                        {slide.title ? (
                          <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
                            {slide.title}
                          </h2>
                        ) : null}
                        {slide.subtitle ? (
                          <p
                            className={cn(
                              "mt-2 text-sm sm:text-base lg:text-lg",
                              hell ? "text-foreground/80" : "text-white/85",
                            )}
                          >
                            {slide.subtitle}
                          </p>
                        ) : null}
                        {slide.href && slide.ctaLabel ? (
                          <span
                            className={cn(
                              "mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors",
                              hell
                                ? "bg-brand text-brand-foreground group-hover:bg-brand-hover"
                                : "bg-gold text-gold-foreground group-hover:bg-gold/85",
                            )}
                          >
                            {slide.ctaLabel}
                            <ArrowRight className="size-4" aria-hidden />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          );

          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="Folie"
              aria-label={`${index + 1} von ${anzahl}`}
              aria-hidden={!sichtbar}
              className={cn(
                "absolute inset-0",
                !ruhig && "transition-opacity duration-700 ease-out",
                sichtbar ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0",
              )}
            >
              {slide.href ? (
                <Link
                  href={slide.href}
                  tabIndex={sichtbar ? 0 : -1}
                  className="group absolute inset-0 block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-gold"
                  {...(slide.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {inhalt}
                </Link>
              ) : (
                inhalt
              )}
            </div>
          );
        })}

        {mehrere ? (
          <>
            <button
              type="button"
              onClick={() => gehe(aktiv - 1)}
              aria-label="Vorheriges Angebot"
              className="absolute left-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md transition-colors hover:bg-white sm:flex"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => gehe(aktiv + 1)}
              aria-label="Nächstes Angebot"
              className="absolute right-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md transition-colors hover:bg-white sm:flex"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => gehe(index)}
                    aria-label={`Angebot ${index + 1}${slide.title ? `: ${slide.title}` : ""}`}
                    aria-current={index === aktiv ? "true" : undefined}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      index === aktiv ? "w-6 bg-gold" : "w-2 bg-white/70 hover:bg-white",
                    )}
                  />
                ))}
                {ruhig ? null : (
                  <button
                    type="button"
                    onClick={() => setPausiert((p) => !p)}
                    aria-label={pausiert ? "Automatischen Wechsel starten" : "Automatischen Wechsel anhalten"}
                    className="ml-1 flex size-5 items-center justify-center rounded-full text-white/85 hover:text-white"
                  >
                    {pausiert ? (
                      <Play className="size-3" aria-hidden />
                    ) : (
                      <Pause className="size-3" aria-hidden />
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
