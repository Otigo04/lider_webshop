import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Anmelden",
  description: "Zugang zum Kundenportal von Lider Großhandel.",
};

const ERROR_MESSAGES: Record<string, string> = {
  deaktiviert: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an uns.",
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

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Der Zugang ist Gewerbekunden vorbehalten. Zugangsdaten erhalten Sie von
        uns.
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
        <LoginForm redirectTo={redirectTo} />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Noch kein Zugang? Schreiben Sie uns an{" "}
        <span className="font-medium text-foreground">[E-MAIL EINTRAGEN]</span>{" "}
        oder rufen Sie an: <span className="font-medium text-foreground">[TELEFON EINTRAGEN]</span>.
      </p>
    </div>
  );
}
