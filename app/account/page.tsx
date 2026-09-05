import type { Metadata } from "next";
import { KeyRound, MapPin, User } from "lucide-react";
import {
  AddressForm,
  PasswordForm,
  ProfileForm,
} from "@/components/forms/account-forms";
import { Button } from "@/components/ui/button";
import { accentIndex } from "@/lib/accent-colors";
import { signOut } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Konto" };

export default async function AccountPage() {
  const user = await requireUser("/account");

  const name = user.company_name || user.full_name || user.email;
  const initialen = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>

      {/* Kopfkarte: Firma/Name auf einen Blick, Farbe aus dem Namen selbst –
          dieselbe Adresse hat immer dieselbe Farbe. */}
      <div className="mt-6 flex items-center gap-4 rounded-md border border-border bg-card p-5">
        <span
          aria-hidden
          className={`flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold tag-${accentIndex(user.email)}`}
        >
          {initialen || "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <p className="ml-auto shrink-0 text-right text-xs text-muted-foreground">
          Kunde seit
          <br />
          <span className="font-medium tabular text-foreground">
            {formatDate(user.created_at)}
          </span>
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Die E-Mail-Adresse ändern wir auf Anfrage – sie ist zugleich Ihr
        Anmeldename.
      </p>

      <section className="mt-6 rounded-md border border-border p-6">
        <div className="flex items-center gap-3">
          <span className="tag-1 flex size-8 items-center justify-center rounded-md">
            <User className="size-4" aria-hidden />
          </span>
          <h2 className="font-medium">Stammdaten</h2>
        </div>
        <div className="mt-4">
          <ProfileForm user={user} />
        </div>
      </section>

      <section className="mt-6 rounded-md border border-border p-6">
        <div className="flex items-center gap-3">
          <span className="tag-6 flex size-8 items-center justify-center rounded-md">
            <MapPin className="size-4" aria-hidden />
          </span>
          <h2 className="font-medium">Adressen</h2>
        </div>
        <div className="mt-4">
          <AddressForm user={user} />
        </div>
      </section>

      <section className="mt-6 rounded-md border border-border p-6">
        <div className="flex items-center gap-3">
          <span className="tag-3 flex size-8 items-center justify-center rounded-md">
            <KeyRound className="size-4" aria-hidden />
          </span>
          <h2 className="font-medium">Passwort</h2>
        </div>
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
