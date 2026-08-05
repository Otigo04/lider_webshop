import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Landingpage für nicht angemeldete Besucher.
 *
 * Die mit [ ... ] markierten Stellen sind bewusst offen: Sortiment, Anschrift
 * und Kontaktdaten dürfen nicht erfunden werden. Vor dem ersten Deploy ersetzen.
 */

const LEISTUNGEN = [
  {
    title: "Staffelpreise ohne Nachfragen",
    text: "Jeder Artikel zeigt alle Mengenstufen mit dem jeweiligen Stückpreis. Der Preis wird beim Bestellen automatisch nach der Menge berechnet.",
  },
  {
    title: "Bestände in Echtzeit",
    text: "Verfügbare Mengen stehen direkt am Artikel. Keine Bestellung auf gut Glück, keine Nachfrage per Telefon.",
  },
  {
    title: "Bestellung rund um die Uhr",
    text: "Das Kundenportal ist immer erreichbar. Bestellungen und Historie bleiben nachvollziehbar dokumentiert.",
  },
  {
    title: "Fester Ansprechpartner",
    text: "Bei Rückfragen, Sonderkonditionen oder größeren Abnahmemengen sprechen Sie direkt mit uns.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-border bg-secondary">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Großhandel für Gewerbekunden
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            [HEADLINE – z. B. „Ihr Lieferant für Warengruppe X in Region Y“]
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            [KURZBESCHREIBUNG – ein bis zwei Sätze: welches Sortiment, für welche
            Kunden, welches Liefergebiet.]
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/login">Zum Kundenportal</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#kontakt">Zugang anfragen</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Leistungen */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          Was Sie im Kundenportal erwartet
        </h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          {LEISTUNGEN.map((item) => (
            <div key={item.title}>
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-2 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Über uns */}
      <section className="border-y border-border bg-muted">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Über uns</h2>
            <p className="mt-4 text-muted-foreground">
              [WER WIR SIND – zwei bis drei Sätze: seit wann am Markt, was Sie
              beliefern, was Sie von anderen Anbietern unterscheidet.]
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-6 self-start">
            <div>
              <dt className="text-sm text-muted-foreground">Am Markt seit</dt>
              <dd className="mt-1 text-2xl font-semibold tabular">[JAHR]</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Artikel im Sortiment
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular">[ANZAHL]</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Liefergebiet</dt>
              <dd className="mt-1 text-2xl font-semibold">[REGION]</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Mindestbestellwert
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular">[BETRAG]</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Kontakt */}
      <section id="kontakt" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Zugang anfragen</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Das Portal steht ausschließlich Gewerbekunden offen. Nennen Sie uns
          Firma, Ansprechpartner und Gewerbenachweis – wir richten den Zugang ein
          und schicken die Zugangsdaten per E-Mail.
        </p>

        <dl className="mt-8 grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Telefon</dt>
            <dd className="mt-1 font-medium">[TELEFON]</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">E-Mail</dt>
            <dd className="mt-1 font-medium">[E-MAIL]</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Anschrift</dt>
            <dd className="mt-1 font-medium">[STRASSE, PLZ ORT]</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
