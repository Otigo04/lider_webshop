import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Hammer, Mail, Package, Phone, Sparkles } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { formatDate } from "@/lib/format";
import { getLogoMarkPath } from "@/lib/logo";
import { getMaintenanceInfo, getPublicContact } from "@/lib/queries/settings";

const STANDARDTEXT =
  "Unser neuer Webshop für Spielzeug, Multimedia und Handyzubehör ist in Eigenentwicklung. In Kürze sind Staffelpreise, aktuelle Bestände und Ihr Kundenkonto wieder für Sie da.";

export const metadata: Metadata = {
  title: "Wartungsarbeiten",
  description:
    "Der LIDER-Webshop ist in Eigenentwicklung und aktuell für neue Besucher nicht erreichbar.",
  // Eine Baustellenseite gehört nicht in den Suchindex – die echten Seiten
  // sollen dort stehen, sobald der Shop wieder offen ist.
  robots: { index: false, follow: false },
};

/**
 * Wartungsscreen für unregistrierte Besucher (Migration 041, proxy.ts).
 * Bestandskunden und Admin sehen diese Seite nie – sie haben bereits eine
 * Sitzung, die den Proxy an jeder Route durchlässt.
 */
export default async function WartungPage() {
  const logoPath = getLogoMarkPath();
  const [kontakt, wartung] = await Promise.all([
    getPublicContact(),
    getMaintenanceInfo(),
  ]);

  return (
    <div className="relative overflow-hidden bg-surface-dark py-20 text-surface-dark-foreground sm:py-28">
      <div aria-hidden className="hero-backdrop" />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-60" />

      <div className="relative mx-auto max-w-xl px-4 text-center">
        <Reveal className="flex flex-col items-center">
          <div className="relative flex size-20 items-center justify-center">
            <span className="pulse-ring absolute inset-0 rounded-full" />
            {logoPath ? (
              <Image
                src={logoPath}
                alt="LIDER"
                width={80}
                height={80}
                className="relative h-auto w-16 object-contain"
                priority
              />
            ) : (
              <span className="relative text-lg font-semibold tracking-[0.14em]">
                LIDER
              </span>
            )}

            <Hammer
              aria-hidden
              className="float absolute -left-10 top-1 size-6 text-gold-bright"
            />
            <Package
              aria-hidden
              className="float float-delay-2 absolute -right-9 top-3 size-6 text-gold-bright"
            />
            <Sparkles
              aria-hidden
              className="float float-delay-1 absolute left-1/2 -top-8 size-5 -translate-x-1/2 text-gold-bright"
            />
          </div>

          <p className="eyebrow mt-8 text-gold-bright">Wartungsarbeiten</p>
          <h1 className="headline mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Hier entsteht etwas Großes.
          </h1>
          <span className="heading-bar mx-auto" />

          <p className="mt-6 text-lg text-surface-dark-muted">
            {wartung.message || STANDARDTEXT}
          </p>

          {wartung.until ? (
            <p className="mt-3 text-sm font-medium text-gold-bright">
              Voraussichtlich verfügbar ab {formatDate(wartung.until)}
            </p>
          ) : null}

          <div
            className="mt-9 h-1.5 w-56 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Arbeiten laufen"
          >
            <div className="progress-sweep h-full w-1/3 rounded-full bg-gold" />
          </div>
        </Reveal>

        {(kontakt.phone || kontakt.email) && (
          <Reveal
            delay={120}
            className="mt-12 flex flex-col items-center gap-2.5 border-t border-white/10 pt-8 text-sm"
          >
            <p className="text-surface-dark-muted">
              Sie erreichen uns in der Zwischenzeit weiterhin:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {kontakt.phone ? (
                <Link
                  href={`tel:${kontakt.phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-2 font-medium text-surface-dark-foreground hover:text-gold-bright"
                >
                  <Phone aria-hidden className="size-4 text-gold-bright" />
                  {kontakt.phone}
                </Link>
              ) : null}
              {kontakt.email ? (
                <Link
                  href={`mailto:${kontakt.email}`}
                  className="inline-flex items-center gap-2 font-medium text-surface-dark-foreground hover:text-gold-bright"
                >
                  <Mail aria-hidden className="size-4 text-gold-bright" />
                  {kontakt.email}
                </Link>
              ) : null}
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
