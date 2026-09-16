"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Megaphone, Percent, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SiteBanner, SiteBannerTone } from "@/lib/types";

/**
 * Flächen der Hinweisleiste. Gold trägt dunkle Schrift: weißer Text auf dem
 * Lorbeergold käme nur auf gut 3:1, für kleine Schrift zu wenig.
 */
export const BANNER_TONE_CLASSES: Record<SiteBannerTone, string> = {
  brand: "bg-brand text-brand-foreground",
  gold: "bg-gold-bright text-surface-dark",
  signal: "bg-signal text-signal-foreground",
};

/** Wie lange ein Hinweis steht, bevor der nächste kommt. */
const WECHSEL_MS = 5500;

function Symbol({ banner }: { banner: SiteBanner }) {
  const Icon = /versand|liefer/i.test(banner.message)
    ? Truck
    : banner.tone === "signal"
      ? Percent
      : Megaphone;
  return <Icon className="size-3.5 shrink-0" aria-hidden />;
}

/**
 * Leiste über der Kopfleiste (Migration 035, gepflegt unter /admin/settings).
 *
 * Mehrere Hinweise wechseln sich ab, jeweils mit kurzem Auftritt von unten.
 * Beim Draufzeigen hält der Wechsel an – wer gerade den Link anklicken will,
 * soll ihn nicht unter dem Zeiger verlieren. In Kasse und Verwaltung steht die
 * Leiste nicht: dort wird gearbeitet, nicht eingekauft.
 */
export function AnnouncementBar({ banners }: { banners: SiteBanner[] }) {
  const pfad = usePathname();
  const [index, setIndex] = useState(0);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    if (banners.length < 2 || pause) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % banners.length),
      WECHSEL_MS,
    );
    return () => window.clearInterval(timer);
  }, [banners.length, pause]);

  if (banners.length === 0) return null;
  if (pfad.startsWith("/admin") || pfad.startsWith("/kasse")) return null;

  const banner = banners[index % banners.length];
  const extern = banner.link_url ? /^https?:\/\//i.test(banner.link_url) : false;

  return (
    <div
      role="region"
      aria-label="Hinweise"
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
      className={cn(
        "banner-bar relative overflow-hidden transition-colors duration-500",
        BANNER_TONE_CLASSES[banner.tone],
      )}
    >
      <div
        // key: neuer Knoten je Hinweis, damit die Auftrittsanimation neu startet.
        key={banner.id}
        className="banner-message mx-auto flex min-h-9 max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold sm:text-sm"
      >
        <Symbol banner={banner} />
        <span className="min-w-0">{banner.message}</span>
        {banner.link_url ? (
          <Link
            href={banner.link_url}
            target={extern ? "_blank" : undefined}
            rel={extern ? "noopener noreferrer" : undefined}
            className="group inline-flex shrink-0 items-center gap-1 underline decoration-current/40 underline-offset-2 hover:decoration-current"
          >
            {banner.link_label || "Mehr"}
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>

      {banners.length > 1 ? (
        <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 gap-1 md:flex">
          {banners.map((eintrag, i) => (
            <button
              key={eintrag.id}
              type="button"
              aria-label={`Hinweis ${i + 1} anzeigen`}
              aria-current={i === index % banners.length}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full bg-current transition-all duration-300",
                i === index % banners.length ? "w-4 opacity-90" : "w-1.5 opacity-35",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
