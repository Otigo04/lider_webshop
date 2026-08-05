import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Landingpage für nicht angemeldete Besucher.
 *
 * Offen bleiben nur die mit [ ... ] markierten Kontaktdaten – die dürfen nicht
 * erfunden werden. Vor dem ersten Deploy ersetzen.
 */

const WARENGRUPPEN = [
  {
    kreis: "10",
    name: "Spielzeug",
    text: "Saisonware und Ganzjahressortiment.",
  },
  {
    kreis: "11",
    name: "Multimedia",
    text: "Unterhaltungselektronik und Zubehör.",
  },
  {
    kreis: "12",
    name: "Handyzubehör",
    text: "Hüllen, Kabel, Ladegeräte, Schutzglas.",
  },
];

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
      <section className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="eyebrow text-surface-dark-muted">
            Großhandel für Gewerbekunden
          </p>
          <h1 className="headline mt-4 max-w-3xl text-4xl font-bold leading-[1.08] sm:text-6xl">
            Spielzeug, Multimedia und Handyzubehör
            <span className="block text-surface-dark-muted">aus Berlin</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-surface-dark-muted">
            LIDER Berlin beliefert Händler seit 2007. Im Kundenportal sehen Sie
            das Sortiment mit Staffelpreisen und aktuellen Beständen und
            bestellen direkt.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {/* Auf der dunklen Fläche wäre die Primärfarbe (Charcoal) unsichtbar. */}
            <Button
              asChild
              size="lg"
              className="bg-brand text-brand-foreground hover:bg-brand-hover"
            >
              <Link href="/login">Zum Kundenportal</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-surface-dark-border bg-transparent text-surface-dark-foreground hover:bg-white/10 hover:text-surface-dark-foreground"
            >
              <Link href="#kontakt">Zugang anfragen</Link>
            </Button>
          </div>

          {/*
           * Warengruppen mit ihren Nummernkreisen. Die Nummern sind keine
           * Dekoration – Artikel dieser Gruppen tragen sie in ihrer
           * Artikelnummer (12-0001) und Kunden bestellen darüber.
           */}
          <ul className="mt-16 grid gap-px overflow-hidden rounded-md border border-surface-dark-border bg-surface-dark-border sm:grid-cols-3">
            {WARENGRUPPEN.map((gruppe) => (
              <li key={gruppe.name} className="bg-surface-dark p-5">
                <p className="code text-xs text-surface-dark-muted">
                  {gruppe.kreis}
                </p>
                <p className="mt-2 font-medium">{gruppe.name}</p>
                <p className="mt-1 text-sm text-surface-dark-muted">
                  {gruppe.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Leistungen */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow text-muted-foreground">Kundenportal</p>
        <h2 className="headline mt-3 text-3xl font-bold">
          Was Sie im Portal erwartet
        </h2>
        <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {LEISTUNGEN.map((item) => (
            <div key={item.title} className="border-t-2 border-foreground pt-4">
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Über uns */}
      <section className="border-y border-border bg-muted">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <p className="eyebrow text-muted-foreground">Über uns</p>
            <h2 className="headline mt-3 text-3xl font-bold">
              Achtzehn Jahre am selben Ort
            </h2>
            <p className="mt-4 text-muted-foreground">
              LIDER Berlin ist ein Groß- und Einzelhandel und besteht seit 2007.
              Wir führen Spielzeug, Multimedia und Handyzubehör und bauen das
              Sortiment laufend aus.
            </p>
            <p className="mt-4 text-muted-foreground">
              Gewachsen sind wir über Händler, die wiederkommen: verlässliche
              Verfügbarkeit, klare Konditionen und ein direkter Draht statt
              Ticketsystem.
            </p>
          </div>
          <dl className="grid gap-6 self-start sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Am Markt seit</dt>
              <dd className="mt-1 text-2xl font-semibold tabular">2007</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Standort</dt>
              <dd className="mt-1 text-2xl font-semibold">Berlin</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Warengruppen</dt>
              <dd className="mt-1 font-medium">
                Spielzeug · Multimedia · Handyzubehör
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Kontakt */}
      <section id="kontakt" className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow text-muted-foreground">Kontakt</p>
        <h2 className="headline mt-3 text-3xl font-bold">Zugang anfragen</h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
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
