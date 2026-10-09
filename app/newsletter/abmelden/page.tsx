import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { meldeNewsletterAb } from "@/lib/newsletter-abo";
import { abmeldeTokenGueltig } from "@/lib/newsletter-token";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Newsletter abbestellen",
  robots: { index: false },
};

/**
 * Landeseite des Abmeldelinks. Der Link zeigt nur diese Seite mit einem Knopf
 * (Mail-Scanner rufen Links vorab per GET ab und dürfen nichts auslösen);
 * abgemeldet wird erst mit dem Klick, ohne Anmeldung.
 */
export default async function NewsletterAbmeldenPage({
  searchParams,
}: PageProps<"/newsletter/abmelden">) {
  const params = await searchParams;
  const u = typeof params.u === "string" ? params.u : "";
  const t = typeof params.t === "string" ? params.t : "";
  const gueltig = /^[0-9a-f-]{36}$/i.test(u) && abmeldeTokenGueltig(u, t);

  async function abmelden() {
    "use server";
    await meldeNewsletterAb(u, t);
    redirect(`/newsletter/abmelden?u=${u}&t=${encodeURIComponent(t)}&fertig=1`);
  }

  const erledigt = params.fertig === "1";

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      {!gueltig ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Link ungültig</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Der Abmeldelink ist unvollständig. Sie können den Newsletter jederzeit in
            Ihrem Kundenkonto unter „Newsletter“ abbestellen.
          </p>
        </>
      ) : erledigt ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Sie sind abgemeldet</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sie erhalten keine Newsletter mehr von uns. Bestellbestätigungen und
            Rechnungen bekommen Sie weiterhin.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Newsletter abbestellen?</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Mit einem Klick melden wir Sie vom Newsletter ab. Bestellbestätigungen und
            Rechnungen bekommen Sie weiterhin.
          </p>
          <form
            action={abmelden}
            className="mt-6"
          >
            <Button type="submit">Newsletter abbestellen</Button>
          </form>
        </>
      )}
    </div>
  );
}
