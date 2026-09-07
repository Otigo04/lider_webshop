import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Konto aktiviert",
  description: "Bestätigung der E-Mail-Adresse für das Kundenportal von Lider Großhandel.",
  // Bestätigungsseiten gehören nicht in den Suchindex.
  robots: { index: false, follow: false },
};

/**
 * Landeseite nach dem Klick auf den Bestätigungslink aus der
 * Registrierungsmail (app/auth/confirm/route.ts leitet hierher).
 *
 * Zwei Fälle: Hat die Bestätigung eine Session gesetzt, geht es direkt weiter
 * ins Sortiment. Wurde nur die Adresse bestätigt – etwa weil der Link in
 * einem anderen Browser geöffnet wurde als die Registrierung –, bleibt der
 * Weg über die Anmeldung. Beide Male sagt die Seite zuerst, dass es geklappt
 * hat; das ist die Frage, mit der der Kunde herkommt.
 */
export default async function WillkommenPage() {
  const user = await getCurrentUser();
  const angemeldet = Boolean(user?.is_active);
  const ziel = user?.role === "admin" ? "/admin" : "/shop";

  return (
    <AuthShell
      eyebrow="Kundenportal"
      title="Konto ist freigeschaltet"
      subtitle="Ihre E-Mail-Adresse ist bestätigt. Preise, Staffeln und Bestände sind ab sofort sichtbar."
      points={[
        "Aktuelle Bestände in Echtzeit",
        "Staffelpreise je Artikel",
        "Bestellhistorie jederzeit einsehbar",
      ]}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
      </div>

      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        E-Mail-Adresse bestätigt
      </h1>

      {angemeldet ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Ihr Konto ist aktiviert{user?.full_name ? `, ${user.full_name}` : ""}.
            Sie sind angemeldet und können sofort bestellen.
          </p>

          <Link
            href={ziel}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Zum Sortiment
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Ihr Konto ist aktiviert. Melden Sie sich mit Ihrer E-Mail-Adresse und
            Ihrem Passwort an, um Preise und Bestände zu sehen.
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Jetzt anmelden
          </Link>
        </>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Fragen zum Zugang?{" "}
        <Link href="/impressum" className="font-medium text-foreground hover:underline">
          Kontakt
        </Link>
      </p>
    </AuthShell>
  );
}
