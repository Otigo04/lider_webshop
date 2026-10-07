import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { confirmEmail } from "@/lib/actions/verification";

export const metadata: Metadata = {
  title: "E-Mail bestätigen",
  robots: { index: false, follow: false },
};

/**
 * Ziel des Links aus der Bestätigungsmail. Die Seite löst das Token nicht
 * selbst ein, sondern zeigt einen Knopf: Mail-Programme und Virenscanner rufen
 * Links vorab per GET ab und würden das Token sonst verbrauchen, bevor der
 * Kunde klickt.
 */
export default async function BestaetigenPage({ searchParams }: PageProps<"/bestaetigen">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <AuthShell
      eyebrow="Kundenportal"
      title="E-Mail-Adresse bestätigen"
      subtitle="Mit einem Klick schalten wir Ihr Konto frei."
      points={[
        "Aktuelle Bestände in Echtzeit",
        "Staffelpreise je Artikel",
        "Bestellhistorie jederzeit einsehbar",
      ]}
    >
      <h1 className="text-2xl font-semibold tracking-tight">E-Mail-Adresse bestätigen</h1>
      {token ? (
        <form action={confirmEmail} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <p className="mb-4 text-sm text-muted-foreground">
            Bitte bestätigen Sie, dass diese Adresse Ihnen gehört.
          </p>
          <Button type="submit">Jetzt bestätigen</Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Der Link ist unvollständig. Öffnen Sie ihn bitte direkt aus der Mail oder{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            melden Sie sich an
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
