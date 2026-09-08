import Image from "next/image";
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
import { CategoryCarousel } from "@/components/category-carousel";
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
  const {
    neuheiten,
    topseller,
    categories,
    productCount,
    ticker,
    sortiment,
    schaufenster,
  } = await getLandingData();

  const gelistet = categories.filter((category) => category.productCount > 0);
  /*
   * Vier Fotos für den Kopfbereich, bei jedem Aufruf andere. Das Mischen und
   * die Reihenfolge – erst Reduziertes, Topseller und Neuheiten, dann der
   * übrige Katalog – macht getLandingData; hier wird nur abgeschnitten.
   *
   * Reicht es nicht für vier, tritt die Warengruppenliste an die Stelle: ein
   * halb gefülltes Raster sähe nach Fehler aus.
   */
  const heroBilder = schaufenster.slice(0, 4);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <p className="eyebrow enter text-gold-bright">
              Groß- und Einzelhandel
            </p>
            <h1 className="headline enter enter-1 mt-4 text-4xl font-bold leading-[1.08] sm:text-6xl">
              Spielzeug, Multimedia und Handyzubehör
              <span className="block text-gold">im Großhandel</span>
            </h1>
            <p className="enter enter-2 mt-6 max-w-xl text-lg leading-relaxed text-surface-dark-muted">
              LIDER beliefert Händler seit 2007. Sehen Sie sich das Sortiment
              an – Staffelpreise, Bestände und Bestellung stehen im Kundenportal
              für Gewerbekunden.
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

          {/*
            Ware statt Fließtext neben der Überschrift. Ein Händler entscheidet
            am Bild, ob das Sortiment zu ihm passt – die Warengruppen stehen
            eine Bildschirmhöhe tiefer noch einmal, samt Artikelzahl.
          */}
          {heroBilder.length === 4 ? (
            <div className="enter enter-2 grid grid-cols-2 gap-3">
              {heroBilder.map((product) => (
                <Link
                  key={product.id}
                  href={`/shop/product/${product.id}`}
                  className="group relative aspect-square overflow-hidden rounded-md border border-surface-dark-border bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <Image
                    src={product.imageUrl!}
                    alt={product.name}
                    fill
                    sizes="(min-width: 1024px) 240px, 45vw"
                    className="object-contain p-5 transition-transform duration-500 group-hover:scale-[1.05]"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-surface-dark/85 px-3 py-1.5 text-xs font-medium text-surface-dark-foreground">
                    {product.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
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
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- Katalogband */}
      <CatalogTicker items={ticker} />

      {/* ------------------------------------------------------ Warengruppen */}
      {gelistet.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-gold">Nach Warengruppe</p>
                <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">
                  Unsere Warengruppen
                </h2>
              </div>
              <Link
                href="/shop"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover"
              >
                Alle Warengruppen
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={80} className="mt-8">
            <CategoryCarousel categories={gelistet} />
          </Reveal>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- Sortiment */}
      {sortiment.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-gold">Querschnitt</p>
                <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">
                  Aus dem Sortiment
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

          {/* Die Warengruppen stehen jetzt als Bildreihe darüber – hier bleibt
              die Ware selbst, über die volle Breite. */}
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sortiment.slice(0, 12).map((product, index) => (
              <Reveal key={product.id} delay={index * 40} className="flex">
                <CatalogCard product={product} className="card-hover w-full" />
              </Reveal>
            ))}
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
                    Zuletzt ins Sortiment aufgenommen. Wer regelmäßig
                    hereinschaut, sieht sofort, was dazugekommen ist.
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
              LIDER ist ein Groß- und Einzelhandel und besteht seit 2007.
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
            <p className="eyebrow text-gold-bright">Kontakt</p>
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
