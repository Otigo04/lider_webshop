import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen",
  robots: { index: false, follow: false },
};

/**
 * Ziel des Links aus der Reset-Mail. Die Seite löst das Token nicht selbst
 * ein, sondern verweist per Knopf auf /auth/confirm: Mail-Programme und
 * Virenscanner rufen Links vorab per GET ab und würden das Einmal-Token sonst
 * verbrauchen, bevor der Kunde klickt.
 */
export default async function PasswortZuruecksetzenPage({
  searchParams,
}: PageProps<"/passwort-zuruecksetzen">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";

  return (
    <AuthShell
      eyebrow="Kundenportal"
      title="Zugang wiederherstellen"
      subtitle="Mit einem Klick vergeben Sie ein neues Passwort."
      points={["Link ist eine Stunde gültig", "Konto bleibt währenddessen unverändert"]}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Passwort zurücksetzen</h1>
      {tokenHash ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Bitte bestätigen Sie, dass Sie ein neues Passwort vergeben möchten.
          </p>
          <div className="mt-6">
            <a
              href={`/auth/confirm?type=recovery&token_hash=${encodeURIComponent(tokenHash)}`}
              className={buttonVariants()}
            >
              Neues Passwort vergeben
            </a>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Der Link ist unvollständig. Öffnen Sie ihn bitte direkt aus der Mail oder{" "}
          <Link href="/forgot-password" className="font-medium text-foreground hover:underline">
            fordern Sie einen neuen an
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
