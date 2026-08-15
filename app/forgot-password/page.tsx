import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export const metadata: Metadata = {
  title: "Passwort vergessen",
  description: "Passwort zurücksetzen für das Kundenportal von Lider Großhandel.",
};

const ERROR_MESSAGES: Record<string, string> = {
  ungueltig: "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const notice =
    typeof params.error === "string" ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Passwort vergessen</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum
        Zurücksetzen des Passworts.
      </p>

      {notice ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-8 rounded-md border border-border bg-card p-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
