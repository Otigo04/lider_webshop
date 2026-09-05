import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Layers,
  PackageCheck,
  Truck,
  UserCheck,
} from "lucide-react";
import { CatalogCard } from "@/components/catalog-card";
import { CatalogTicker } from "@/components/catalog-ticker";
import { ProductRail } from "@/components/product-rail";
import { Reveal } from "@/components/reveal";
import { StatCounter } from "@/components/stat-counter";
import { Button } from "@/components/ui/button";
import { accentIndex } from "@/lib/accent-colors";
import { getLandingData, type LandingCategory } from "@/lib/queries/products";

/**
 * Landingpage für nicht angemeldete Besucher.
 *
 * Aufbau folgt dem Weg des Einkäufers: erst die Ware (Warengruppen und ein
 * Querschnitt des Sortiments), dann was neu ist und was gut läuft, danach
 * erst die Erklärung zum Portal, zum Betrieb und zur Registrierung. Wer
 * einkaufen will, sieht Ware, bevor er Fließtext sieht.
 *
 * Die Artikel kommen aus der öffentlichen View ohne Staffelpreise. Offen
 * bleiben nur die mit [ ... ] markierten Kontaktdaten – die dürfen nicht
 * erfunden werden. Vor dem ersten Deploy ersetzen.
 */

const LEISTUNGEN = [
  {
    icon: Layers,
    title: "Staffelpreise ohne Nachfragen",
    text: "Jeder Artikel zeigt alle Mengenstufen mit dem jeweiligen Stückpreis. Der Preis wird beim Bestellen automatisch nach der Menge berechnet.",
  },
  {
    icon: PackageCheck,
    title: "Bestände in Echtzeit",
    text: "Verfügbare Mengen stehen direkt am Artikel. Keine Bestellung auf gut Glück, keine Nachfrage per Telefon.",
  },
  {
    icon: Truck,
    title: "Versand oder Abholung",
    text: "Sie entscheiden pro Bestellung. Ab 100 € netto liefern wir versandkostenfrei, Abholung in Berlin ist jederzeit möglich.",
  },
  {
    icon: UserCheck,
    title: "Fester Ansprechpartner",
    text: "Bei Rückfragen, Sonderkonditionen oder größeren Abnahmemengen sprechen Sie direkt mit uns.",
  },
];

export default async function HomePage() {
  const { neuheiten, topseller, categories, productCount, ticker, sortiment } =
    await getLandingData();

  const gelistet = categories.filter((category) => category.productCount > 0);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <p className="eyebrow enter text-gold">
              Großhandel für Gewerbekunden
            </p>
            <h1 className="headline enter enter-1 mt-4 text-4xl font-bold leading-[1.08] sm:text-6xl">
              Spielzeug, Multimedia und Handyzubehör
              <span className="block text-gold">aus Berlin</span>
            </h1>
            <p className="enter enter-2 mt-6 max-w-xl text-lg leading-relaxed text-surface-dark-muted">
              LIDER Berlin beliefert Händler seit 2007. Sehen Sie sich das
              Sortiment an – Staffelpreise, Bestände und Bestellung stehen im
              Kundenportal.
            </p>

            <div className="enter enter-3 mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              {/* Gold auf Navy: auf der dunklen Fläche die einzige Farbe mit
                  genug Kontrast, und sie kommt aus dem Logo. */}
              <Button
                asChild
                size="lg"
                className="bg-gold text-gold-foreground hover:bg-gold/85"
              >
                <Link href="/shop">Zum Sortiment</Link>
              </Button>
              {/* Bewusst als Link statt zweitem Button: eine klare Primärhandlung. */}
              <Link
                href="/login"
                className="text-sm font-medium text-surface-dark-foreground underline decoration-surface-dark-muted underline-offset-4 hover:decoration-gold"
              >
                Zum Kundenportal
              </Link>
            </div>
          </div>

          {/* Warengruppen als Einstieg. Ohne die Nummernkreise: die stehen in
              der Artikelnummer, auf der Startseite sagen sie niemandem etwas. */}
          <ul className="enter enter-2 divide-y divide-surface-dark-border overflow-hidden rounded-md border border-surface-dark-border">
            {gelistet.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/shop/${category.slug}`}
                  className="group flex items-center gap-4 p-5 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold"
                >
                  <span
                    aria-hidden
                    className={`size-2.5 shrink-0 rounded-full tag-dot-${accentIndex(category.slug)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{category.name}</span>
                    <span className="block text-sm text-surface-dark-muted tabular">
                      {category.productCount} Artikel
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-surface-dark-muted transition-transform group-hover:translate-x-1 group-hover:text-gold"
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

      {/* ---------------------------------------------------------- Sortiment */}
      {sortiment.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-gold">Warengruppen und Artikel</p>
                <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">
                  Das Sortiment
                </h2>
              </div>
              <Link
                href="/shop"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover"
              >
                Ganzes Sortiment ansehen
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-10">
            {/* Warengruppen untereinander, Artikel daneben – das ist die
                Gliederung, die ein Katalog auf Papier auch hätte. */}
            <Reveal>
              <div className="lg:sticky lg:top-24">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Warengruppen
                </h3>
                <ul className="mt-4 space-y-2">
                  {gelistet.map((category) => (
                    <li key={category.id}>
                      <WarengruppenKachel category={category} />
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {sortiment.slice(0, 12).map((product, index) => (
                <Reveal key={product.id} delay={index * 40} className="flex">
                  <CatalogCard product={product} className="card-hover w-full" />
                </Reveal>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Alle Preise netto zzgl. USt. Staffelpreise, Bestände und Bestellung
            im Kundenportal.
          </p>
        </section>
      ) : null}

      {/* --------------------------------------------------------- Neuheiten */}
      {neuheiten.length > 0 ? (
        <section className="border-y border-gold/30 bg-gold-soft">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow text-gold">Neu im Sortiment</p>
                  <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">
                    Neuheiten
                  </h2>
                  <p className="mt-3 max-w-lg text-muted-foreground">
                    Frisch aufgenommene Ware trägt drei Tage lang das
                    Neu-Zeichen. Wer regelmäßig hereinschaut, sieht sofort, was
                    dazugekommen ist.
                  </p>
                </div>
                <Link
                  href="/shop/neuheiten"
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover"
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
                    className="card-hover w-[15rem] shrink-0 snap-start sm:w-[16rem]"
                  />
                ))}
              </ProductRail>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- Topseller */}
      {topseller.length > 0 ? (
        <section className="border-b border-border bg-muted">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-12">
              <Reveal>
                <div className="lg:sticky lg:top-24">
                  <p className="eyebrow text-gold">Läuft gut</p>
                  <h2 className="headline mt-3 text-3xl font-bold">Topseller</h2>
                  <p className="mt-4 text-muted-foreground">
                    Artikel, die unsere Händler regelmäßig nachbestellen. Bei
                    diesen Positionen halten wir die Bestände bewusst hoch.
                  </p>
                  <Link
                    href="/shop/topseller"
                    className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover"
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
                    <CatalogCard product={product} className="card-hover w-full" />
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
          <p className="eyebrow text-gold">Kundenportal</p>
          <h2 className="headline mt-3 text-3xl font-bold">
            Was Sie im Portal erwartet
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {LEISTUNGEN.map((item, index) => (
            <Reveal key={item.title} delay={index * 70}>
              <div className="card-hover group h-full rounded-lg border border-border bg-card p-6">
                <div className="flex size-10 items-center justify-center rounded-md bg-brand text-brand-foreground transition-colors group-hover:bg-gold group-hover:text-gold-foreground">
                  <item.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {item.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Über uns */}
      <section className="border-y border-border bg-brand-soft">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-brand">Über uns</p>
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
              <Kennzahl label="Am Markt seit">
                <StatCounter value={2007} />
              </Kennzahl>
              <Kennzahl label="Standort">Berlin</Kennzahl>
              <Kennzahl label="Artikel gelistet">
                <StatCounter value={productCount} />
              </Kennzahl>
              <Kennzahl label="Warengruppen">
                <StatCounter value={gelistet.length} />
              </Kennzahl>
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- Kontakt */}
      <section id="kontakt" className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <p className="eyebrow text-gold">Kontakt</p>
            <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">
              Registrieren
            </h2>
            <p className="mt-4 max-w-xl text-surface-dark-muted">
              Das Portal steht ausschließlich Gewerbekunden offen. Legen Sie Ihr
              Konto direkt an – Sie sehen Preise und Bestände sofort, ohne
              Wartezeit.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-6 bg-gold text-gold-foreground hover:bg-gold/85"
            >
              <Link href="/register">Jetzt registrieren</Link>
            </Button>
          </Reveal>

          <dl className="mt-12 grid gap-6 border-t border-surface-dark-border pt-8 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-surface-dark-muted">Telefon</dt>
              <dd className="mt-1 font-medium">[TELEFON]</dd>
            </div>
            <div>
              <dt className="text-surface-dark-muted">E-Mail</dt>
              <dd className="mt-1 font-medium">[E-MAIL]</dd>
            </div>
            <div>
              <dt className="text-surface-dark-muted">Anschrift</dt>
              <dd className="mt-1 font-medium">[STRASSE, PLZ ORT]</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}

/**
 * Warengruppe als farbige Kachel. Die Farbe kommt aus dem Namen der Gruppe
 * (lib/accent-colors.ts) und bleibt dadurch über alle Seiten hinweg dieselbe.
 */
function WarengruppenKachel({ category }: { category: LandingCategory }) {
  const farbe = accentIndex(category.slug);

  return (
    <Link
      href={`/shop/${category.slug}`}
      className={`group flex items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2.5 text-sm font-medium transition-colors tag-${farbe} hover:border-current`}
    >
      <span className="min-w-0 truncate">{category.name}</span>
      <span className="shrink-0 text-xs opacity-80 tabular">
        {category.productCount}
      </span>
    </Link>
  );
}

function Kennzahl({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-brand">{children}</dd>
    </div>
  );
}
