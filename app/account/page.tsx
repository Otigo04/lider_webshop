import type { Metadata } from "next";
import { PasswordForm, ProfileForm } from "@/components/forms/account-forms";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Konto" };

export default async function AccountPage() {
  const user = await requireUser("/account");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">E-Mail</dt>
          <dd className="mt-1 font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kunde seit</dt>
          <dd className="mt-1 font-medium tabular">
            {formatDate(user.created_at)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Die E-Mail-Adresse ändern wir auf Anfrage – sie ist zugleich Ihr
        Anmeldename.
      </p>

      <section className="mt-10 rounded-md border border-border p-6">
        <h2 className="font-medium">Stammdaten</h2>
        <div className="mt-4">
          <ProfileForm user={user} />
        </div>
      </section>

      <section className="mt-6 rounded-md border border-border p-6">
        <h2 className="font-medium">Passwort</h2>
        <div className="mt-4">
          <PasswordForm />
        </div>
      </section>

      <form action={signOut} className="mt-10">
        <Button type="submit" variant="outline">
          Abmelden
        </Button>
      </form>
    </div>
  );
}
