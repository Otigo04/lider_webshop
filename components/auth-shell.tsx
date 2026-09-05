import Image from "next/image";
import { Check } from "lucide-react";
import { getLogoPath } from "@/lib/logo";

/**
 * Zweispaltiger Rahmen für Login/Registrierung/Passwort-Ablauf: links die
 * Marke mit den wichtigsten Argumenten, rechts das eigentliche Formular.
 * Auf schmalen Bildschirmen bleibt nur die rechte Spalte – das Formular ist
 * die eine Aufgabe der Seite, der Marken-Teil ist Zugabe.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  points,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  points: string[];
  children: React.ReactNode;
}) {
  const logoPath = getLogoPath();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <div className="grid overflow-hidden rounded-lg border border-border shadow-sm lg:grid-cols-2">
        <div className="hidden bg-surface-dark p-10 text-surface-dark-foreground lg:flex lg:flex-col lg:justify-between">
          <div>
            {logoPath ? (
              <Image
                src={logoPath}
                alt="LIDER Berlin"
                width={132}
                height={100}
                className="mb-8 h-auto w-28 object-contain"
              />
            ) : null}
            <p className="eyebrow text-gold-bright">{eyebrow}</p>
            <h2 className="headline mt-3 text-3xl font-bold leading-tight">
              {title}
            </h2>
            <p className="mt-4 max-w-sm text-surface-dark-muted">{subtitle}</p>
          </div>

          <ul className="mt-10 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-gold text-gold-foreground">
                  <Check className="size-2.5" strokeWidth={3} aria-hidden />
                </span>
                <span className="text-surface-dark-foreground">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-center bg-card p-6 sm:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
