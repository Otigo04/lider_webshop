import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { FirstPasswordForm } from "@/components/forms/first-password-form";
import { signOut } from "@/lib/actions/auth";
import { getCurrentAuthUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Passwort festlegen",
};

/**
 * Ziel des Zwangs aus proxy.ts: ein vom Admin angelegtes Konto oder ein
 * zurückgesetztes Startpasswort muss ersetzt werden, bevor der Kunde etwas
 * anderes sieht. Wer das Flag nicht trägt, hat hier nichts zu tun.
 */
export default async function ChangeInitialPasswordPage() {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.must_change_password !== true) redirect("/shop");

  return (
    <AuthShell
      eyebrow="Kundenportal"
      title="Willkommen bei LIDER"
      subtitle="Vergeben Sie ein eigenes Passwort, bevor Sie loslegen."
      points={[
        "Das Startpasswort gilt danach nicht mehr",
        "Danach geht es direkt in den Shop",
      ]}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Passwort festlegen</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sie sind mit einem Startpasswort angemeldet ({user.email}). Bitte
        wählen Sie jetzt Ihr eigenes.
      </p>

      <div className="mt-6">
        <FirstPasswordForm />
      </div>

      <form action={signOut} className="mt-6 text-center">
        <button
          type="submit"
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          Abmelden
        </button>
      </form>
    </AuthShell>
  );
}
