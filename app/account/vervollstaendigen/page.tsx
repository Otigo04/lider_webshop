import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfilVervollstaendigenForm } from "@/components/forms/profile-complete-form";
import { Button } from "@/components/ui/button";
import { profilSpaeter } from "@/lib/actions/account";
import { requireUser } from "@/lib/auth";
import { profilLuecken } from "@/lib/profil";

export const metadata: Metadata = { title: "Angaben vervollständigen" };

/**
 * Konten, die der Admin angelegt hat, kommen ohne vollständige Firmen- und
 * Anschriftsdaten an. Nach dem ersten Login wird einmal darum gebeten; wer
 * „später“ wählt, kann trotzdem stöbern – bestellen geht erst mit diesen
 * Angaben (Checkout und createOrder prüfen dieselbe Liste, lib/profil.ts).
 */
export default async function VervollstaendigenPage({
  searchParams,
}: PageProps<"/account/vervollstaendigen">) {
  const user = await requireUser("/account/vervollstaendigen");
  const params = await searchParams;
  const roh = typeof params.weiter === "string" ? params.weiter : "";
  const weiter = roh.startsWith("/") && !roh.startsWith("//") ? roh : "/shop";

  const luecken = profilLuecken(user);
  if (user.role !== "customer" || luecken.length === 0) redirect(weiter);

  // Wer von der Kasse hierher geschickt wurde, kann nicht „später“ wählen –
  // genau dafür ist die Seite da.
  const ausBestellung = weiter.startsWith("/checkout") || weiter.startsWith("/cart");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Bitte ergänzen Sie Ihre Angaben
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {ausBestellung
          ? "Vor Ihrer ersten Bestellung brauchen wir noch diese Angaben – sie stehen auf Ihrer Rechnung."
          : "Wir haben Ihr Konto für Sie angelegt. Diese Angaben stehen auf Ihrer Rechnung und werden vor der ersten Bestellung gebraucht."}{" "}
        Es fehlen: {luecken.join(", ")}.
      </p>

      <section className="mt-6 rounded-md border border-border p-6">
        <ProfilVervollstaendigenForm user={user} weiter={weiter} />
      </section>

      {ausBestellung ? null : (
        <form action={profilSpaeter} className="mt-4">
          <input type="hidden" name="weiter" value={weiter} />
          <Button type="submit" variant="ghost">
            Später ausfüllen
          </Button>
        </form>
      )}
    </div>
  );
}
