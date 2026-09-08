import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarRange,
  CreditCard,
  Euro,
  Percent,
  Printer,
  Receipt,
} from "lucide-react";
import { TagAbschliessenButton } from "@/components/kasse/tag-abschliessen-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, formatQuantity } from "@/lib/format";
import {
  getKassenHeute,
  getKassentage,
  holeAbschluesseNach,
  type Kassentag,
} from "@/lib/queries/kasse";
import { getPosTopProductsRange } from "@/lib/queries/pos";
import {
  ZEITRAUM_LABELS,
  ZEITRAUM_PRESETS,
  alsDatum,
  zeitraumAusParams,
} from "@/lib/kassen-zeitraum";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Umsätze" };

const TAGESDATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const WOCHENTAG = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

const MONATSNAME = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

/**
 * Umsatzübersicht der Kasse.
 *
 * Was am Tagesabschluss fehlt: dort steht ein Monat je Seite, weil die
 * Z-Nummern in Monatsblöcken geführt werden. Wer wissen will, was diese Woche
 * hereinkam oder wie der September gegen den August steht, blättert dafür
 * durch Seiten. Hier steht stattdessen der Zeitraum vorn und die Auflösung
 * daneben: dieselben Zahlen, einmal je Tag und einmal je Monat.
 *
 * Gerechnet wird nicht neu. Die Zahlen kommen aus denselben Tagessummen wie
 * der Abschluss (pos_day_totals); die Monatszeilen sind deren Summe. Zwei
 * Wege zu derselben Zahl wären zwei Wege, sie unterschiedlich zu bekommen.
 */
export default async function UmsaetzePage({
  searchParams,
}: PageProps<"/kasse/umsaetze">) {
  const params = await searchParams;

  // Wie auf den anderen Kassenseiten: vergessene Abschlüsse beim Öffnen
  // nachholen, damit hier keine offenen Vortage stehen.
  await holeAbschluesseNach();

  const heute = await getKassenHeute();
  const zeitraum = zeitraumAusParams(params, heute);
  const gruppe = params.gruppe === "monat" ? "monat" : "tag";

  const [tage, topProdukte] = await Promise.all([
    getKassentage(zeitraum.von, zeitraum.bis),
    getPosTopProductsRange(
      alsDatum(zeitraum.von),
      // Bis einschließlich: der Vergleich läuft gegen den Anfang des Folgetags.
      new Date(alsDatum(zeitraum.bis).getTime() + 86_400_000),
      8,
    ),
  ]);

  const summe = tage.reduce(
    (gesamt, tag) => ({
      bons: gesamt.bons + tag.bons,
      netto: gesamt.netto + tag.netto,
      ust: gesamt.ust + tag.ust,
      brutto: gesamt.brutto + tag.brutto,
      bar: gesamt.bar + tag.bar,
      karte: gesamt.karte + tag.karte,
    }),
    { bons: 0, netto: 0, ust: 0, brutto: 0, bar: 0, karte: 0 },
  );

  const monate = zuMonaten(tage);
  const zeilen = gruppe === "monat" ? monate : tage;
  // Bezugsgröße der Balken: die größte Zeile der Liste. Ein fester Maßstab
  // wäre an einem ruhigen Tag nur eine Reihe von Strichen.
  const spitze = Math.max(...zeilen.map((zeile) => zeile.brutto), 0);
  const durchschnitt = summe.bons > 0 ? summe.brutto / summe.bons : 0;
  const kartenanteil =
    summe.brutto > 0 ? Math.round((summe.karte / summe.brutto) * 100) : 0;

  // Zeitraum und Auflösung stehen in derselben Adresszeile – ein Wechsel der
  // Auflösung darf den gewählten Zeitraum nicht verwerfen.
  const basis = new URLSearchParams();
  if (zeitraum.preset) basis.set("zeitraum", zeitraum.preset);
  else {
    basis.set("von", zeitraum.von);
    basis.set("bis", zeitraum.bis);
  }
  const gruppeLink = (ziel: "tag" | "monat") => {
    const suche = new URLSearchParams(basis);
    suche.set("gruppe", ziel);
    return `/kasse/umsaetze?${suche}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Umsätze</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {TAGESDATUM.format(alsDatum(zeitraum.von))} bis{" "}
            {TAGESDATUM.format(alsDatum(zeitraum.bis))} ·{" "}
            {formatQuantity(tage.length)}{" "}
            {tage.length === 1 ? "Kassentag" : "Kassentage"} mit Umsatz
          </p>
        </div>

        <div className="flex rounded-md border border-border p-0.5">
          <Aufloesung href={gruppeLink("tag")} aktiv={gruppe === "tag"} label="Je Tag" />
          <Aufloesung
            href={gruppeLink("monat")}
            aktiv={gruppe === "monat"}
            label="Je Monat"
          />
        </div>
      </div>

      {/* ---------------------------------------------------------- Filter */}
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <nav aria-label="Zeitraum" className="flex flex-wrap gap-1.5">
          {ZEITRAUM_PRESETS.map((preset) => {
            const suche = new URLSearchParams({ zeitraum: preset, gruppe });
            return (
              <Link
                key={preset}
                href={`/kasse/umsaetze?${suche}`}
                aria-current={zeitraum.preset === preset ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  zeitraum.preset === preset
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {ZEITRAUM_LABELS[preset]}
              </Link>
            );
          })}
        </nav>

        <form
          action="/kasse/umsaetze"
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
        >
          <input type="hidden" name="gruppe" value={gruppe} />
          <div>
            <label
              htmlFor="umsatz-von"
              className="block text-xs text-muted-foreground"
            >
              von
            </label>
            <Input
              id="umsatz-von"
              type="date"
              name="von"
              defaultValue={zeitraum.von}
              max={heute}
              className="mt-1 w-44"
            />
          </div>
          <div>
            <label
              htmlFor="umsatz-bis"
              className="block text-xs text-muted-foreground"
            >
              bis
            </label>
            <Input
              id="umsatz-bis"
              type="date"
              name="bis"
              defaultValue={zeitraum.bis}
              max={heute}
              className="mt-1 w-44"
            />
          </div>
          <Button type="submit" variant="secondary">
            <CalendarRange className="size-4" aria-hidden />
            Zeitraum anzeigen
          </Button>
        </form>
      </div>

      {/* ------------------------------------------------------- Kennzahlen */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kennzahl
          icon={Euro}
          label="Umsatz brutto"
          wert={formatPrice(summe.brutto)}
          ton="gold"
        />
        <Kennzahl
          icon={Euro}
          label="davon netto"
          wert={formatPrice(summe.netto)}
          ton="neutral"
          zusatz={`${formatPrice(summe.ust)} USt.`}
        />
        <Kennzahl
          icon={Receipt}
          label="Belege"
          wert={formatQuantity(summe.bons)}
          ton="neutral"
          zusatz={`Ø ${formatPrice(durchschnitt)} je Bon`}
        />
        <Kennzahl
          icon={Percent}
          label="Kartenanteil"
          wert={`${formatQuantity(kartenanteil)} %`}
          ton="neutral"
          zusatz={`${formatPrice(summe.karte)} von ${formatPrice(summe.brutto)}`}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <Kennzahl
          icon={Banknote}
          label="bar vereinnahmt"
          wert={formatPrice(summe.bar)}
          ton="brand"
        />
        <Kennzahl
          icon={CreditCard}
          label="über Karte"
          wert={formatPrice(summe.karte)}
          ton="brand"
        />
      </section>

      {/* ----------------------------------------------------------- Liste */}
      {zeilen.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          In diesem Zeitraum wurde über die Kasse nichts verkauft.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">
                  {gruppe === "monat" ? "Monat" : "Tag"}
                </th>
                <th className="py-2 pr-3 text-right font-medium">Belege</th>
                <th className="py-2 pr-3 text-right font-medium">Bar</th>
                <th className="py-2 pr-3 text-right font-medium">Karte</th>
                <th className="py-2 pr-3 text-right font-medium">Netto</th>
                <th className="py-2 pr-3 text-right font-medium">USt.</th>
                <th className="py-2 pr-3 text-right font-medium">Brutto</th>
                <th className="w-40 py-2 pr-3 font-medium">Anteil</th>
                <th className="py-2 text-right font-medium">
                  {gruppe === "monat" ? "Tage" : "Abschluss"}
                </th>
              </tr>
            </thead>
            <tbody>
              {gruppe === "monat"
                ? monate.map((monat) => (
                    <tr
                      key={monat.monat}
                      className="border-b border-border last:border-0"
                    >
                      <td className="whitespace-nowrap py-2.5 pr-3 font-medium">
                        {MONATSNAME.format(alsDatum(`${monat.monat}-01`))}
                      </td>
                      <Zahlen zeile={monat} />
                      <Balken wert={monat.brutto} spitze={spitze} />
                      <td className="py-2.5 text-right">
                        <Link
                          href={`/kasse/umsaetze?von=${monat.von}&bis=${monat.bis}&gruppe=tag`}
                          className="text-sm text-brand hover:underline"
                        >
                          {formatQuantity(monat.tage)}{" "}
                          {monat.tage === 1 ? "Tag" : "Tage"}
                        </Link>
                      </td>
                    </tr>
                  ))
                : tage.map((tag) => (
                    <tr
                      key={tag.datum}
                      className={cn(
                        "border-b border-border last:border-0",
                        tag.laufend && "bg-gold-soft/40",
                      )}
                    >
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        <span className="font-medium tabular">
                          {TAGESDATUM.format(alsDatum(tag.datum))}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {WOCHENTAG.format(alsDatum(tag.datum))}
                        </span>
                        {tag.abschluss ? (
                          <span className="ml-2 text-xs text-muted-foreground tabular">
                            {tag.abschluss.z_number}
                          </span>
                        ) : null}
                      </td>
                      <Zahlen zeile={tag} />
                      <Balken wert={tag.brutto} spitze={spitze} />
                      <td className="py-2.5 text-right">
                        <TagesAktion tag={tag} />
                      </td>
                    </tr>
                  ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-3 pr-3">Summe</td>
                <td className="py-3 pr-3 text-right tabular">
                  {formatQuantity(summe.bons)}
                </td>
                <td className="py-3 pr-3 text-right tabular">
                  {formatPrice(summe.bar)}
                </td>
                <td className="py-3 pr-3 text-right tabular">
                  {formatPrice(summe.karte)}
                </td>
                <td className="py-3 pr-3 text-right tabular text-muted-foreground">
                  {formatPrice(summe.netto)}
                </td>
                <td className="py-3 pr-3 text-right tabular text-muted-foreground">
                  {formatPrice(summe.ust)}
                </td>
                <td className="py-3 pr-3 text-right tabular">
                  {formatPrice(summe.brutto)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* --------------------------------------------------- Meistverkauft */}
      <section className="mt-10">
        <h2 className="font-medium">Meistverkauft in diesem Zeitraum</h2>
        {topProdukte.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Keine Kassenverkäufe im Zeitraum.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {topProdukte.map((product) => (
              <li key={product.sku} className="flex justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="code text-xs text-muted-foreground">{product.sku}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular">
                    {formatQuantity(product.quantity)} Stk.
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {formatPrice(product.revenue)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// --- Bausteine ---------------------------------------------------------------

interface Zeilenwerte {
  bons: number;
  bar: number;
  karte: number;
  netto: number;
  ust: number;
  brutto: number;
}

/** Die sechs Zahlenspalten – für Tages- und Monatszeilen dieselben. */
function Zahlen({ zeile }: { zeile: Zeilenwerte }) {
  return (
    <>
      <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
        {formatQuantity(zeile.bons)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular">{formatPrice(zeile.bar)}</td>
      <td className="py-2.5 pr-3 text-right tabular">{formatPrice(zeile.karte)}</td>
      <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
        {formatPrice(zeile.netto)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
        {formatPrice(zeile.ust)}
      </td>
      <td className="py-2.5 pr-3 text-right font-semibold tabular">
        {formatPrice(zeile.brutto)}
      </td>
    </>
  );
}

/**
 * Anteilsbalken. Die Zahl steht daneben – der Balken ist der Vergleich, nicht
 * die Angabe: welcher Tag aus der Reihe fällt, sieht man in einer Zahlenspalte
 * erst beim Nachrechnen.
 */
function Balken({ wert, spitze }: { wert: number; spitze: number }) {
  const anteil = spitze > 0 ? Math.round((wert / spitze) * 100) : 0;

  return (
    <td className="py-2.5 pr-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${anteil}%` }}
        />
      </div>
    </td>
  );
}

/** Z-Bon drucken, wenn der Tag abgeschlossen ist – sonst ihn abschließen. */
function TagesAktion({ tag }: { tag: Kassentag }) {
  const datum = alsDatum(tag.datum);
  const label = `${WOCHENTAG.format(datum)}, ${TAGESDATUM.format(datum)}`;

  if (tag.abschluss && !tag.abweichend) {
    return (
      <Button asChild variant="outline" size="sm">
        <a
          href={`/kasse/tagesabschluss/${tag.datum}/bon`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Printer className="size-4" aria-hidden /> Z-Bon
        </a>
      </Button>
    );
  }

  return (
    <TagAbschliessenButton
      datum={tag.datum}
      label={label}
      neu={tag.abweichend}
      laufend={tag.laufend}
      variante={tag.abschluss === null ? "secondary" : "outline"}
    />
  );
}

function Aufloesung({
  href,
  aktiv,
  label,
}: {
  href: string;
  aktiv: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={aktiv ? "page" : undefined}
      className={cn(
        "rounded px-3 py-1.5 text-sm font-medium transition-colors",
        aktiv
          ? "bg-brand text-brand-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

interface Monatszeile extends Zeilenwerte {
  /** YYYY-MM */
  monat: string;
  von: string;
  bis: string;
  tage: number;
}

/**
 * Tageszeilen zu Monaten zusammenfassen. In der Anwendung und nicht in der
 * Datenbank: die Tagessummen sind für die Tagesansicht ohnehin geladen, und
 * eine zweite Gruppierung in SQL wäre eine zweite Stelle, an der sich eine
 * Zahl ändern kann.
 */
function zuMonaten(tage: Kassentag[]): Monatszeile[] {
  const summen = new Map<string, Monatszeile>();

  for (const tag of tage) {
    const monat = tag.datum.slice(0, 7);
    const zeile =
      summen.get(monat) ??
      {
        monat,
        von: tag.datum,
        bis: tag.datum,
        tage: 0,
        bons: 0,
        bar: 0,
        karte: 0,
        netto: 0,
        ust: 0,
        brutto: 0,
      };

    zeile.tage += 1;
    zeile.bons += tag.bons;
    zeile.bar += tag.bar;
    zeile.karte += tag.karte;
    zeile.netto += tag.netto;
    zeile.ust += tag.ust;
    zeile.brutto += tag.brutto;
    // getKassentage liefert absteigend – der kleinere Tag ist der Monatsanfang.
    if (tag.datum < zeile.von) zeile.von = tag.datum;
    if (tag.datum > zeile.bis) zeile.bis = tag.datum;

    summen.set(monat, zeile);
  }

  return [...summen.values()].sort((a, b) => b.monat.localeCompare(a.monat));
}

function Kennzahl({
  icon: Icon,
  label,
  wert,
  ton,
  zusatz,
}: {
  icon: LucideIcon;
  label: string;
  wert: string;
  ton: "gold" | "brand" | "neutral";
  zusatz?: string;
}) {
  const flaeche = {
    gold: "border-gold/50 bg-gold-soft",
    brand: "border-brand/40 bg-brand-soft",
    neutral: "border-border bg-card",
  }[ton];

  const symbol = {
    gold: "bg-gold text-gold-foreground",
    brand: "bg-brand text-brand-foreground",
    neutral: "bg-muted text-muted-foreground",
  }[ton];

  const zahl = { gold: "text-gold", brand: "text-brand", neutral: "" }[ton];

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border-2 p-4 ${flaeche}`}
    >
      <span>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className={`mt-1 block text-2xl font-semibold tabular ${zahl}`}>
          {wert}
        </span>
        {zusatz ? (
          <span className="mt-0.5 block text-xs text-muted-foreground tabular">
            {zusatz}
          </span>
        ) : null}
      </span>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${symbol}`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
    </div>
  );
}
