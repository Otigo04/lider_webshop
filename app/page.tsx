import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { CatalogCard } from "@/components/catalog-card";
import { CatalogTicker } from "@/components/catalog-ticker";
import { AccessRequestForm } from "@/components/forms/access-request-form";
import { ProductRail } from "@/components/product-rail";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { getLandingData } from "@/lib/queries/products";

/**
 * Landingpage für nicht angemeldete Besucher.
 *
 * Aufbau folgt dem Weg des Einkäufers: Was gibt es (Warengruppen) – was ist
 * neu – was läuft gut – wie bestellt man – wer sind wir – Zugang anfragen.
 *
 * Die Artikel kommen aus der öffentlichen View ohne Preise. Offen bleiben nur
 * die mit [ ... ] markierten Kontaktdaten – die dürfen nicht erfunden werden.
 * Vor dem ersten Deploy ersetzen.
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
    title: "Versand oder Abholung",
    text: "Sie entscheiden pro Bestellung. Ab 100 € netto liefern wir versandkostenfrei, Abholung in Berlin ist jederzeit möglich.",
  },
  {
    title: "Fester Ansprechpartner",
    text: "Bei Rückfragen, Sonderkonditionen oder größeren Abnahmemengen sprechen Sie direkt mit uns.",
  },
];

export default async function HomePage() {
  const { neuheiten, topseller, categories, productCount, ticker } =
    await getLandingData();

  const gelistet = categories.filter((category) => category.productCount > 0);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <p className="eyebrow enter text-surface-dark-muted">
              Großhandel für Gewerbekunden
            </p>
            <h1 className="headline enter enter-1 mt-4 text-4xl font-bold leading-[1.08] sm:text-6xl">
              Spielzeug, Multimedia und Handyzubehör
              <span className="block text-surface-dark-muted">aus Berlin</span>
            </h1>
            <p className="enter enter-2 mt-6 max-w-xl text-lg leading-relaxed text-surface-dark-muted">
              LIDER Berlin beliefert Händler seit 2007. Im Kundenportal sehen Sie
              das Sortiment mit Staffelpreisen und aktuellen Beständen und
              bestellen direkt.
            </p>

            <div className="enter enter-3 mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              {/* Auf der dunklen Fläche wäre die Primärfarbe (Charcoal) unsichtbar. */}
              <Button
                asChild
                size="lg"
                className="bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                <Link href="/login">Zum Kundenportal</Link>
              </Button>
              {/* Bewusst als Link statt zweitem Button: eine klare Primärhandlung. */}
              <Link
                href="#kontakt"
                className="text-sm font-medium text-surface-dark-foreground underline decoration-surface-dark-muted underline-offset-4 hover:decoration-surface-dark-foreground"
              >
                Noch kein Zugang? Anfragen
              </Link>
            </div>
          </div>

          {/*
           * Warengruppen mit ihren Nummernkreisen. Die Nummern sind keine
           * Dekoration – Artikel dieser Gruppen tragen sie in ihrer
           * Artikelnummer (12-0001), Kunden bestellen und reklamieren darüber.
           */}
          <ul className="enter enter-2 divide-y divide-surface-dark-border overflow-hidden rounded-md border border-surface-dark-border">
            {gelistet.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/shop/${category.slug}`}
                  className="group flex items-center gap-5 p-5 transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                >
                  <span className="code w-12 shrink-0 text-3xl font-semibold text-surface-dark-border transition-colors group-hover:text-brand">
                    {category.sku_prefix}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{category.name}</span>
                    <span className="block text-sm text-surface-dark-muted tabular">
                      {category.productCount} Artikel
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-surface-dark-muted transition-transform group-hover:translate-x-1 group-hover:text-surface-dark-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------- Katalogband */}
      <CatalogTicker items={ticker} />

      {/* Das Band zeigt Ware und "ab"-Preis; die Einordnung steht darunter. */}
      <p className="mx-auto max-w-6xl px-4 pt-4 text-center text-xs text-muted-foreground">
        Alle Preise netto zzgl. USt. Staffelpreise, Bestände und Bestellung im
        Kundenportal.
      </p>

      {/* --------------------------------------------------------- Neuheiten */}
      {neuheiten.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-muted-foreground">Neu im Sortiment</p>
                <h2 className="headline mt-3 text-3xl font-bold">Neuheiten</h2>
              </div>
              <Link
                href="/shop/neuheiten"
                className="group inline-flex items-center gap-1.5 text-sm font-medium hover:text-brand"
              >
                Alle Neuheiten
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={80} className="mt-8">
            <ProductRail label="Neuheiten">
              {neuheiten.map((product) => (
                <CatalogCard
                  key={product.id}
                  product={product}
                  className="w-[15rem] shrink-0 snap-start sm:w-[16rem]"
                />
              ))}
            </ProductRail>
          </Reveal>
        </section>
      ) : null}

      {/* --------------------------------------------------------- Topseller */}
      {topseller.length > 0 ? (
        <section className="border-y border-border bg-muted">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-12">
              <Reveal>
                <div className="lg:sticky lg:top-24">
                  <p className="eyebrow text-muted-foreground">Läuft gut</p>
                  <h2 className="headline mt-3 text-3xl font-bold">Topseller</h2>
                  <p className="mt-4 text-muted-foreground">
                    Artikel, die unsere Händler regelmäßig nachbestellen. Bei
                    diesen Positionen halten wir die Bestände bewusst hoch.
                  </p>
                  <Link
                    href="/shop/topseller"
                    className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium hover:text-brand"
                  >
                    Alle Topseller
                    <ArrowUpRight
                      className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </div>
              </Reveal>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {topseller.slice(0, 6).map((product, index) => (
                  <Reveal key={product.id} delay={index * 60} className="flex">
                    <CatalogCard product={product} className="w-full" />
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------- Leistungen */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <p className="eyebrow text-muted-foreground">Kundenportal</p>
          <h2 className="headline mt-3 text-3xl font-bold">
            Was Sie im Portal erwartet
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {LEISTUNGEN.map((item, index) => (
            <Reveal key={item.title} delay={index * 70}>
              <div className="border-t-2 border-foreground pt-4">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {item.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Über uns */}
      <section className="border-y border-border bg-muted">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-muted-foreground">Über uns</p>
            <h2 className="headline mt-3 text-3xl font-bold">
              Seit 2007 am selben Ort
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
          </Reveal>

          <Reveal delay={80}>
            <dl className="grid gap-6 self-start sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Am Markt seit</dt>
                <dd className="mt-1 text-2xl font-semibold tabular">2007</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Standort</dt>
                <dd className="mt-1 text-2xl font-semibold">Berlin</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  Artikel gelistet
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular">
                  {productCount}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Warengruppen</dt>
                <dd className="mt-1 text-2xl font-semibold tabular">
                  {gelistet.length}
                </dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- Kontakt */}
      <section id="kontakt" className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <p className="eyebrow text-muted-foreground">Kontakt</p>
          <h2 className="headline mt-3 text-3xl font-bold">Zugang anfragen</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Das Portal steht ausschließlich Gewerbekunden offen. Füllen Sie das
            Formular aus – wir richten den Zugang ein und schicken die
            Zugangsdaten per E-Mail.
          </p>
        </Reveal>

        <div className="mt-8 max-w-2xl">
          <AccessRequestForm />
        </div>

        <dl className="mt-12 grid gap-6 border-t border-border pt-8 text-sm sm:grid-cols-3">
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
