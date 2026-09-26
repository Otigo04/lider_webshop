import type { Metadata } from "next";
import Link from "next/link";
import { FaqListe } from "@/components/faq-liste";
import { faqGruppen } from "@/lib/faq";
import { getPublicContact } from "@/lib/queries/settings";

export const metadata: Metadata = {
  title: "Häufige Fragen",
  description:
    "Konto, Preise, Staffeln, Zahlung, Versand und Abholung bei LIDER – kurz beantwortet.",
  alternates: { canonical: "/faq" },
};

/**
 * Häufige Fragen, vollständig.
 *
 * Die Fragen selbst stehen in lib/faq.tsx – die Startseite zeigt daraus die
 * wichtigsten. Hier ist nichts gekürzt: wer bis hierher klickt, will alles
 * sehen.
 */
export default async function FaqPage() {
  const { free_shipping_threshold: versandFreiAb } = await getPublicContact();
  const gruppen = faqGruppen(versandFreiAb);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="eyebrow text-gold">Kurz beantwortet</p>
      <h1 className="headline mt-3 text-3xl font-bold">Häufige Fragen</h1>

      <div className="mt-10 space-y-10">
        {gruppen.map((gruppe) => (
          <section key={gruppe.titel}>
            <h2 className="text-base font-semibold">{gruppe.titel}</h2>
            <FaqListe fragen={gruppe.fragen} className="mt-3" />
          </section>
        ))}
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        Nicht dabei?{" "}
        <Link href="/kontakt" className="font-medium text-brand hover:underline">
          Rufen Sie uns an oder schreiben Sie uns
        </Link>
        .
      </p>
    </div>
  );
}
