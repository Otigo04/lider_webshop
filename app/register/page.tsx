import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/forms/register-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Registrieren",
  description: "Konto für Gewerbekunden im Kundenportal von Lider Großhandel anlegen.",
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user?.is_active) {
    redirect(user.role === "admin" ? "/admin" : "/shop");
  }

  return (
    <AuthShell
      eyebrow="Neu bei LIDER"
      title="In zwei Minuten startklar"
      subtitle="Nach dem Anlegen sehen Sie Preise und Bestände sofort – ohne Wartezeit auf Freischaltung."
      points={[
        "Sofortiger Zugang, keine Freischaltung nötig",
        "Alle Preisstaffeln direkt sichtbar",
        "Direkter Draht statt Ticketsystem",
      ]}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Registrieren</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Der Zugang ist Gewerbekunden vorbehalten. Nach dem Anlegen können Sie
        sofort im Sortiment stöbern und bestellen.
      </p>

      <div className="mt-6">
        <RegisterForm />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Schon registriert?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Anmelden
        </Link>
      </p>
    </AuthShell>
  );
}
