import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/forms/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Anmelden",
  description: "Zugang zum Kundenportal von LIDER.",
};

const ERROR_MESSAGES: Record<string, string> = {
  deaktiviert: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an uns.",
  bestaetigung:
    "Der Bestätigungslink ist ungültig oder abgelaufen. Melden Sie sich an – wir schicken Ihnen dann einen neuen.",
};

const NOTICE_MESSAGES: Record<string, string> = {
  passwort_gesetzt: "Passwort geändert. Sie können sich jetzt anmelden.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Next 16: searchParams ist ein Promise
  const params = await searchParams;

  const user = await getCurrentUser();
  if (user?.is_active) {
    redirect(user.role === "admin" ? "/admin" : "/shop");
  }

  const redirectTo =
    typeof params.redirect === "string" ? params.redirect : undefined;
  const notice =
    typeof params.error === "string" ? ERROR_MESSAGES[params.error] : undefined;
  const success =
    typeof params.notice === "string" ? NOTICE_MESSAGES[params.notice] : undefined;

  return (
    <AuthShell
      eyebrow="Kundenportal"
      title="Willkommen zurück"
      subtitle="Melden Sie sich an, um Staffelpreise, Bestände und Ihre Bestellhistorie zu sehen."
      points={[
        "Aktuelle Bestände in Echtzeit",
        "Staffelpreise je Artikel",
        "Bestellhistorie jederzeit einsehbar",
      ]}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Der Zugang ist Gewerbekunden vorbehalten. Noch kein Konto? Das Anlegen
        dauert zwei Minuten.
      </p>

      {notice ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {notice}
        </p>
      ) : null}

      {success ? (
        <p
          role="status"
          className="mt-6 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
        >
          {success}
        </p>
      ) : null}

      <div className="mt-6">
        <LoginForm redirectTo={redirectTo} />
        <Link
          href="/forgot-password"
          className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Passwort vergessen?
        </Link>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Noch kein Zugang?{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          Jetzt registrieren
        </Link>
      </p>
    </AuthShell>
  );
}
