import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Layers,
  PackageCheck,
  Percent,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  UserCheck,
} from "lucide-react";
import { CatalogCard } from "@/components/catalog-card";
import { CatalogRow } from "@/components/catalog-row";
import { CatalogTicker } from "@/components/catalog-ticker";
import { CategoryGrid } from "@/components/category-grid";
import { ProductRail } from "@/components/product-rail";
import { RabattBadge } from "@/components/sale-price";
import { Reveal } from "@/components/reveal";
import { SortimentTabs, type SortimentReiter } from "@/components/sortiment-tabs";
import { StatCounter } from "@/components/stat-counter";
import { Button } from "@/components/ui/button";
import { accentIndex } from "@/lib/accent-colors";
import { getCurrentUser } from "@/lib/auth";
import { reduzierung } from "@/lib/pricing";
import { getLandingData } from "@/lib/queries/products";
import { getPublicContact } from "@/lib/queries/settings";
import { formatThreshold } from "@/lib/shipping";
import { cn } from "@/lib/utils";

/**
 * Startseite.
 *
 * Aufbau folgt dem Weg des Einkäufers: Kopfbereich mit Auslage, dann die
 * Warengruppen als Einstieg, danach was gerade reduziert ist, der Querschnitt
 * des Sortiments nach Warengruppe, Neuheiten und Topseller. Erklärung zum
 * Portal, Betrieb und Kontakt stehen am Ende – wer einkaufen will, sieht Ware,
 * bevor er Fließtext sieht.
 *
 * Die Abschnitte wechseln bewusst die Fläche (Navy, Blau getönt, Rot getönt,
 * Weiß, Gold getönt …): eine lange weiße Seite ließ die Abschnitte ineinander
 * laufen, jetzt ist jeder auf einen Blick als eigener zu erkennen.
 *
 * Angemeldete Kunden sehen statt Registrierungsaufrufen die Wege zu
 * Bestellungen und Warenkorb.
 *
 * Kontaktdaten kommen aus /admin/settings (public_company_contact(), Migration
 * 036). Fehlen sie, stehen [ ... ]-Platzhalter da – erfunden wird nichts.
 */

/*
 * Die Versandzusage trägt eine gepflegte Zahl (company_settings, Migration
 * 037), deshalb eine Funktion statt einer Konstante: eine Konstante würde
 * beim Laden des Moduls einmal ausgewertet und bliebe bei einer Änderung der
 * Grenze auf dem alten Wert stehen.
 */
const leistungen = (versandFreiAb: number) => [
  {
    icon: Layers,
    title: "Staffelpreise ohne Nachfragen",
    text: "Jeder Artikel zeigt alle Mengenstufen mit dem jeweiligen Stückpreis. Der Preis wird beim Bestellen automatisch nach der Menge berechnet.",
    farbe: "bg-brand text-brand-foreground",
  },
  {
    icon: PackageCheck,
    title: "Bestände in Echtzeit",
    text: "Verfügbare Mengen stehen direkt am Artikel. Keine Bestellung auf gut Glück, keine Nachfrage per Telefon.",
    farbe: "bg-success text-success-foreground",
  },
  {
    icon: Truck,
    title: "Versand oder Abholung",
    text: `Sie entscheiden pro Bestellung. Ab ${formatThreshold(versandFreiAb)} netto liefern wir versandkostenfrei, Abholung in Berlin ist jederzeit möglich.`,
    farbe: "bg-gold text-gold-foreground",
  },
  {
    icon: UserCheck,
    title: "Fester Ansprechpartner",
    text: "Bei Rückfragen, Sonderkonditionen oder größeren Abnahmemengen sprechen Sie direkt mit uns.",
    farbe: "bg-signal text-signal-foreground",
  },
];

export default async function HomePage() {
  const [daten, user, firma] = await Promise.all([
    getLandingData(),
    getCurrentUser(),
    getPublicContact(),
  ]);
  // Werbeangabe, deshalb auch ohne Anmeldung sichtbar: public_company_contact()
  // gibt die Grenze mit heraus (Migration 037).
  const versandFreiAb = firma.free_shipping_threshold;
  const {
    neuheiten,
    topseller,
    categories,
    productCount,
    ticker,
    sortiment,
    sortimentNachGruppe,
    reduziert,
    schaufenster,
  } = daten;
  const angemeldet = Boolean(user);

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

  // reduziert ist nach Ersparnis absteigend sortiert – vorn steht die größte.
  const hoechsterRabatt = reduziert[0]
    ? (reduzierung(reduziert[0].list_price, reduziert[0].priceFrom)?.prozent ?? 0)
    : 0;

  const reiter: SortimentReiter[] = [
    {
      id: "alle",
      label: "Alle",
      anzahl: productCount,
      farbe: null,
      karten: sortiment.slice(0, 8).map((product) => (
        <CatalogCard key={product.id} product={product} className="w-full" />
      )),
    },
    ...gelistet
      .filter((category) => (sortimentNachGruppe[category.id] ?? []).length > 0)
      .map((category) => ({
        id: category.id,
        label: category.name,
        anzahl: category.productCount,
        farbe: accentIndex(category.slug),
        karten: sortimentNachGruppe[category.id].map((product) => (
          <CatalogCard key={product.id} product={product} className="w-full" />
        )),
      })),
  ];

  const kontakt = [
    { label: "Telefon", wert: firma.phone ?? "[TELEFON]" },
    { label: "E-Mail", wert: firma.email ?? "[E-MAIL]" },
    {
      label: "Anschrift",
      wert:
        firma.address_street && firma.address_city
          ? `${firma.address_street}, ${firma.address_zip ?? ""} ${firma.address_city}`.replace(/\s+/g, " ")
          : "[STRASSE, PLZ ORT]",
    },
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden bg-surface-dark text-surface-dark-foreground">
        <div aria-hidden className="hero-backdrop" />
        <div aria-hidden className="dot-grid absolute inset-0 -z-0 opacity-60" />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <h1 className="headline enter text-4xl font-bold leading-[1.08] sm:text-6xl">
              Spielzeug, Multimedia und Handyzubehör
              <span className="block bg-gradient-to-r from-gold-bright via-gold to-gold-bright bg-clip-text text-transparent">
                im Großhandel
              </span>
            </h1>
            <p className="enter enter-2 mt-6 max-w-xl text-lg leading-relaxed text-surface-dark-muted">
              {angemeldet
                ? "Staffelpreise, aktuelle Bestände und Ihre Bestellungen – alles an einem Ort. Stöbern Sie im Sortiment oder bestellen Sie direkt nach."
                : "LIDER beliefert Händler seit 2007. Sehen Sie sich das Sortiment an – Staffelpreise, Bestände und Bestellung stehen im Kundenportal für Gewerbekunden."}
            </p>

            <div className="enter enter-3 mt-9 flex flex-wrap items-center gap-3">
              {/* Gold auf Navy: auf der dunklen Fläche die einzige Farbe mit
                  genug Kontrast, und sie kommt aus dem Logo. */}
              <Button
                asChild
                size="lg"
                className="shine group bg-gold text-gold-foreground shadow-lg shadow-gold/20 hover:bg-gold/90"
              >
                <Link href="/shop">
                  Zum Sortiment
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-surface-dark-border bg-transparent text-surface-dark-foreground hover:border-gold/60 hover:bg-white/10 hover:text-surface-dark-foreground"
              >
                {angemeldet ? (
                  <Link href="/orders">Meine Bestellungen</Link>
                ) : (
                  <Link href="/register">Kostenlos registrieren</Link>
                )}
              </Button>
            </div>

            {/* Drei Zusagen, die ein Händler vor dem ersten Klick wissen will. */}
            <ul className="enter enter-3 mt-10 flex flex-wrap gap-x-7 gap-y-2.5 border-t border-surface-dark-border pt-5 text-sm">
              <Zusage icon={Truck}>
                Versandkostenfrei ab {formatThreshold(versandFreiAb)} netto
              </Zusage>
              <Zusage icon={Layers}>Staffelpreise je Artikel</Zusage>
              <Zusage icon={Store}>Abholung in Berlin</Zusage>
            </ul>
          </div>

          {/*
            Ware statt Fließtext neben der Überschrift. Ein Händler entscheidet
            am Bild, ob das Sortiment zu ihm passt.
          */}
          {heroBilder.length === 4 ? (
            <div className="enter enter-2 grid grid-cols-2 gap-3 sm:gap-4">
              {heroBilder.map((product, index) => {
                const rabatt = reduzierung(product.list_price, product.priceFrom);
                return (
                  <div
                    key={product.id}
                    className={cn("float", `float-delay-${index}`, index % 2 === 1 && "sm:translate-y-6")}
                  >
                    <Link
                      href={`/shop/product/${product.id}`}
                      className="group relative block aspect-square overflow-hidden rounded-lg border border-white/10 bg-white shadow-2xl shadow-black/30 transition-transform duration-500 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                    >
                      {rabatt ? (
                        <RabattBadge
                          prozent={rabatt.prozent}
                          className="absolute right-2 top-2 z-10 px-2 py-0.5 shadow-sm"
                        />
                      ) : null}
                      <Image
                        src={product.imageUrl!}
                        alt={product.name}
                        fill
                        sizes="(min-width: 1024px) 240px, 45vw"
                        className="object-contain p-5 transition-transform duration-500 group-hover:scale-[1.08]"
                      />
                      <span className="absolute inset-x-0 bottom-0 translate-y-full truncate bg-surface-dark/90 px-3 py-1.5 text-xs font-medium text-surface-dark-foreground transition-transform duration-300 group-hover:translate-y-0 group-focus-visible:translate-y-0">
                        {product.name}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="enter enter-2 divide-y divide-surface-dark-border overflow-hidden rounded-lg border border-surface-dark-border bg-surface-dark/60">
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
        <section className="dot-grid-dark border-b border-border bg-brand-soft">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <Reveal>
              <Kopf
                eyebrow="Einstieg"
                titel="Warengruppen"
                link={{ href: "/shop", label: "Ganzes Sortiment" }}
              />
            </Reveal>
            <Reveal delay={80} className="mt-8">
              <CategoryGrid categories={gelistet} />
            </Reveal>

            {/* Schnellwege zu den Sonderlisten – dieselben Ziele wie in der
                Kopfleiste, hier direkt neben den Warengruppen. */}
            <Reveal delay={140} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Schnellweg
                  href="/shop/reduziert"
                  icon={Percent}
                  titel="Reduziert"
                  text={
                    reduziert.length > 0
                      ? `${reduziert.length} ${reduziert.length === 1 ? "Artikel" : "Artikel"} im Preis gesenkt`
                      : "Gesenkte Preise"
                  }
                  klasse="bg-signal text-signal-foreground"
                />
                <Schnellweg
                  href="/shop/neuheiten"
                  icon={Sparkles}
                  titel="Neuheiten"
                  text="Frisch im Sortiment"
                  klasse="bg-gold-bright text-surface-dark"
                />
                <Schnellweg
                  href="/shop/topseller"
                  icon={TrendingUp}
                  titel="Topseller"
                  text="Wird oft nachbestellt"
                  klasse="bg-surface-dark text-surface-dark-foreground"
                />
              </div>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- Reduziert */}
      {reduziert.length > 0 ? (
        <section className="relative overflow-hidden border-b border-signal/20 bg-signal-soft">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 lg:grid-cols-[19rem_1fr] lg:gap-8">
            {/* Aktionsfeld: trägt die Sektion auch dann, wenn nur ein oder zwei
                Artikel reduziert sind – sonst stünde eine Karte allein in
                einer leeren Bahn. */}
            <Reveal className="flex">
              <div className="relative flex w-full flex-col overflow-hidden rounded-xl bg-signal p-7 text-signal-foreground shadow-xl shadow-signal/25">
                <span
                  aria-hidden
                  className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10"
                />
                <span
                  aria-hidden
                  className="absolute -bottom-16 -left-8 size-44 rounded-full bg-black/10"
                />
                <span className="pulse-ring relative flex size-12 items-center justify-center rounded-full bg-white text-signal">
                  <Percent className="size-6" aria-hidden />
                </span>
                <p className="eyebrow relative mt-6 text-white/80">Preis gesenkt</p>
                <h2 className="headline relative mt-1 text-4xl font-bold">Reduziert</h2>
                <p className="relative mt-3 text-5xl font-extrabold tabular">
                  {reduziert.length > 1 ? (
                    <span className="mr-2 text-2xl font-bold">bis</span>
                  ) : null}
                  −{hoechsterRabatt}&nbsp;%
                </p>
                <p className="relative mt-3 text-sm text-white/85">
                  {reduziert.length === 1
                    ? "Ein Artikel ist gerade im Preis gesenkt"
                    : `${reduziert.length} Artikel sind gerade im Preis gesenkt`}{" "}
                  – solange der Vorrat reicht.
                </p>
                <Button
                  asChild
                  className="shine relative mt-auto w-full bg-white text-signal hover:bg-white/90 lg:mt-8"
                >
                  <Link href="/shop/reduziert">
                    Alle reduzierten Artikel
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={80} className="min-w-0">
              <ProductRail label="Reduzierte Artikel">
                {reduziert.map((product) => (
                  <CatalogCard
                    key={product.id}
                    product={product}
                    className="w-[15rem] shrink-0 snap-start border-signal/25 sm:w-[16rem]"
                  />
                ))}
              </ProductRail>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- Sortiment */}
      {sortiment.length > 0 ? (
        <section className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <Reveal>
              <Kopf
                eyebrow="Querschnitt"
                titel="Aus dem Sortiment"
                link={{ href: "/shop", label: "Ganzes Sortiment ansehen" }}
              />
            </Reveal>

            <Reveal delay={80} className="mt-8">
              <SortimentTabs reiter={reiter} />
            </Reveal>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Alle Preise netto zzgl. USt. Staffelpreise, Bestände und Bestellung
              im Kundenportal.
            </p>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------- Neuheiten & Topseller */}
      {neuheiten.length > 0 || topseller.length > 0 ? (
        <section className="bg-gradient-to-b from-gold-soft to-[#fbe7c6]">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <Reveal>
              <Kopf eyebrow="Was sich bewegt" titel="Neu und gefragt" />
            </Reveal>

            {/* Nebeneinander statt untereinander: zwei kurze Listen füllen eine
                Zeile, zwei lange Bahnen hießen zweimal scrollen. */}
            <div
              className={cn(
                "mt-8 grid gap-5",
                neuheiten.length > 0 && topseller.length > 0 && "lg:grid-cols-2",
              )}
            >
              {neuheiten.length > 0 ? (
                <Reveal delay={60} className="flex min-w-0">
                  <ListenPanel
                    icon={Sparkles}
                    titel="Neuheiten"
                    text="Zuletzt ins Sortiment aufgenommen."
                    href="/shop/neuheiten"
                    linkText="Alle Neuheiten"
                    kopfKlasse="bg-gold-bright text-surface-dark"
                  >
                    {neuheiten.slice(0, 5).map((product) => (
                      <li key={product.id}>
                        <CatalogRow product={product} />
                      </li>
                    ))}
                  </ListenPanel>
                </Reveal>
              ) : null}

              {topseller.length > 0 ? (
                <Reveal delay={120} className="flex min-w-0">
                  <ListenPanel
                    icon={TrendingUp}
                    titel="Topseller"
                    text="Regelmäßig nachbestellt – Bestände bewusst hoch."
                    href="/shop/topseller"
                    linkText="Alle Topseller"
                    kopfKlasse="bg-surface-dark text-surface-dark-foreground"
                  >
                    {topseller.slice(0, 5).map((product, index) => (
                      <li key={product.id}>
                        <CatalogRow product={product} rang={index + 1} />
                      </li>
                    ))}
                  </ListenPanel>
                </Reveal>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------- Leistungen */}
      <section className="bg-muted">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <Reveal>
            <Kopf
              eyebrow="Kundenportal"
              titel={angemeldet ? "Ihre Vorteile im Portal" : "Was Sie im Portal erwartet"}
            />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {leistungen(versandFreiAb).map((item, index) => (
              <Reveal key={item.title} delay={index * 70} className="flex">
                <div className="card-hover group relative w-full overflow-hidden rounded-lg border border-border bg-card p-6">
                  <div
                    className={cn(
                      "flex size-11 items-center justify-center rounded-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110",
                      item.farbe,
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100",
                      item.farbe,
                    )}
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Über uns */}
      <section className="relative overflow-hidden bg-brand text-brand-foreground">
        <div aria-hidden className="dot-grid absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center">
          <Reveal>
            <p className="eyebrow text-gold-bright">Über uns</p>
            <h2 className="headline mt-3 text-3xl font-bold">
              Seit 2007 am selben Ort
            </h2>
            <span aria-hidden className="heading-bar" />
            <p className="mt-5 text-brand-foreground/85">
              LIDER ist ein Groß- und Einzelhandel und besteht seit 2007.
              Wir führen Spielzeug, Multimedia und Handyzubehör und bauen das
              Sortiment laufend aus.
            </p>
            <p className="mt-4 text-brand-foreground/85">
              Gewachsen sind wir über Händler, die wiederkommen: verlässliche
              Verfügbarkeit, klare Konditionen und ein direkter Draht statt
              Ticketsystem.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <dl className="grid grid-cols-2 gap-4">
              <Kennzahl label="Am Markt seit">
                <StatCounter value={2007} jahreszahl />
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
      <section id="kontakt" className="relative overflow-hidden bg-surface-dark text-surface-dark-foreground">
        <div aria-hidden className="hero-backdrop opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow text-gold-bright">Kontakt</p>
                <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">
                  {angemeldet ? "Fragen zu Ihrer Bestellung?" : "Registrieren"}
                </h2>
                <span aria-hidden className="heading-bar" />
                <p className="mt-4 max-w-xl text-surface-dark-muted">
                  {angemeldet
                    ? "Sonderkonditionen, größere Mengen oder eine Rückfrage zur Lieferung – sprechen Sie uns direkt an."
                    : "Das Portal steht ausschließlich Gewerbekunden offen. Legen Sie Ihr Konto direkt an – Sie sehen Preise und Bestände sofort, ohne Wartezeit."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {angemeldet ? (
                  <>
                    <Button
                      asChild
                      size="lg"
                      className="shine bg-gold text-gold-foreground hover:bg-gold/90"
                    >
                      <Link href="/orders">Meine Bestellungen</Link>
                    </Button>
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="border-surface-dark-border bg-transparent text-surface-dark-foreground hover:bg-white/10 hover:text-surface-dark-foreground"
                    >
                      <Link href="/cart">Zum Warenkorb</Link>
                    </Button>
                  </>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    className="shine bg-gold text-gold-foreground hover:bg-gold/90"
                  >
                    <Link href="/register">Jetzt registrieren</Link>
                  </Button>
                )}
              </div>
            </div>
          </Reveal>

          <dl className="mt-12 grid gap-4 text-sm sm:grid-cols-3">
            {kontakt.map((eintrag) => (
              <div
                key={eintrag.label}
                className="rounded-lg border border-surface-dark-border bg-white/[0.03] p-4 transition-colors hover:border-gold/50"
              >
                <dt className="text-surface-dark-muted">{eintrag.label}</dt>
                <dd className="mt-1 font-medium">{eintrag.wert}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}

function Kopf({
  eyebrow,
  titel,
  text,
  link,
}: {
  eyebrow: string;
  titel: string;
  text?: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-gold">{eyebrow}</p>
        <h2 className="headline mt-3 text-3xl font-bold sm:text-4xl">{titel}</h2>
        <span aria-hidden className="heading-bar" />
        {text ? <p className="mt-4 max-w-lg text-muted-foreground">{text}</p> : null}
      </div>
      {link ? (
        <MehrLink href={link.href} className="text-brand hover:text-brand-hover">
          {link.label}
        </MehrLink>
      ) : null}
    </div>
  );
}

function MehrLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-sm font-semibold",
        className,
      )}
    >
      {children}
      <ArrowUpRight
        className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

function Zusage({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 text-surface-dark-foreground/85">
      <Icon className="size-4 shrink-0 text-gold-bright" aria-hidden />
      {children}
    </li>
  );
}

function Schnellweg({
  href,
  icon: Icon,
  titel,
  text,
  klasse,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  titel: string;
  text: string;
  klasse: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "card-hover group flex items-center gap-4 rounded-lg px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        klasse,
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{titel}</span>
        <span className="block text-sm opacity-85">{text}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 transition-transform group-hover:translate-x-1"
        aria-hidden
      />
    </Link>
  );
}

function ListenPanel({
  icon: Icon,
  titel,
  text,
  href,
  linkText,
  kopfKlasse,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  titel: string;
  text: string;
  href: string;
  linkText: string;
  kopfKlasse: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-gold/25 bg-white/70 shadow-sm">
      <div className={cn("flex items-center gap-3 px-5 py-4", kopfKlasse)}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-tight">{titel}</h3>
          <p className="text-sm opacity-80">{text}</p>
        </div>
      </div>
      <ul className="flex-1 space-y-2 p-3">{children}</ul>
      <div className="border-t border-gold/20 px-5 py-3">
        <MehrLink href={href} className="text-brand hover:text-brand-hover">
          {linkText}
        </MehrLink>
      </div>
    </div>
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
    <div className="rounded-lg border border-white/15 bg-white/[0.07] p-5 transition-colors hover:border-gold-bright/60">
      <dt className="text-sm text-brand-foreground/75">{label}</dt>
      <dd className="mt-1 text-3xl font-bold text-gold-bright">{children}</dd>
    </div>
  );
}
