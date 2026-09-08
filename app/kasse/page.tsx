import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarCheck,
  CreditCard,
  Euro,
  FileText,
  Receipt,
  ScanBarcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";
import { getAdminInvoices } from "@/lib/queries/admin";
import {
  getKassenHeute,
  getKassentage,
  holeAbschluesseNach,
} from "@/lib/queries/kasse";
import {
  getPosSales,
  getPosSummary,
  getPosToday,
  getPosTopProducts,
} from "@/lib/queries/pos";
import { POS_PAYMENT_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Kasse & Buchhaltung" };

const uhrzeit = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Tagesanfang in Ortszeit – die Kasse rechnet in Ladenöffnungszeiten, nicht in UTC. */
function tagesbeginn(datum = new Date()): Date {
  const tag = new Date(datum);
  tag.setHours(0, 0, 0, 0);
  return tag;
}

function isoTag(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(
    datum.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Buchhaltungsübersicht des Kassenportals.
 *
 * Führt zusammen, was Geld bewegt: Bargeschäft am Tresen, offene Rechnungen
 * aus dem Katalog. Die Verwaltungsübersicht zeigt weiter Stammdaten und
 * Bestellungen – hier steht nur, was gezahlt wurde und was noch aussteht.
 */
export default async function KassePage() {
  // Vergessene Tagesabschlüsse gleich hier nachholen: wer die Buchhaltung
  // öffnet, soll keinen offenen Vortag vorfinden (siehe lib/queries/kasse.ts).
  await holeAbschluesseNach();

  const heuteAb = tagesbeginn();
  const morgen = new Date(heuteAb);
  morgen.setDate(morgen.getDate() + 1);

  const monatAb = new Date(heuteAb);
  monatAb.setDate(1);

  const kassenTag = await getKassenHeute();

  const [heute, monat, bonsHeute, letzteBons, topProdukte, rechnungen, letzteTage] =
    await Promise.all([
      getPosToday(),
      getPosSummary(monatAb, morgen),
      getPosSales({ from: isoTag(heuteAb), to: isoTag(heuteAb) }),
      getPosSales({ limit: 8 }),
      getPosTopProducts(5),
      getAdminInvoices(),
      // Die letzten zwei Wochen reichen für die Kachel; die volle Reihe steht
      // unter /kasse/tagesabschluss.
      getKassentage(isoTag(new Date(heuteAb.getTime() - 13 * 86_400_000)), kassenTag),
    ]);

  const heutigerAbschluss =
    letzteTage.find((tag) => tag.datum === kassenTag)?.abschluss ?? null;
  const letzterAbschluss =
    letzteTage.find((tag) => tag.abschluss !== null)?.abschluss ?? null;

  // Zahlartenspaltung rechnet die Seite: pos_summary kennt den Zeitraum, nicht
  // die Zahlart, und für einen Ladentag sind das ein paar Dutzend Zeilen.
  const bar = bonsHeute
    .filter((sale) => sale.payment_method === "cash")
    .reduce((summe, sale) => summe + Number(sale.total_amount), 0);
  const karte = bonsHeute
    .filter((sale) => sale.payment_method === "card")
    .reduce((summe, sale) => summe + Number(sale.total_amount), 0);

  const offen = rechnungen.filter((rechnung) => rechnung.status !== "paid");
  const offenerBetrag = offen.reduce(
    (summe, rechnung) =>
      summe +
      (rechnung.type === "order"
        ? (rechnung.order?.total_amount ?? 0)
        : (rechnung.total_amount ?? 0)),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tagesgeschäft am Tresen und offene Forderungen aus dem Katalog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" className="bg-gold hover:bg-gold/85">
            <Link href="/kasse/terminal">
              <ScanBarcode className="size-4" aria-hidden /> Kasse öffnen
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/kasse/rechnungen/new">
              <FileText className="size-4" aria-hidden /> Neue Rechnung
            </Link>
          </Button>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="eyebrow text-muted-foreground">Heute</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kennzahl
            icon={Euro}
            label="Umsatz brutto"
            wert={formatPrice(heute.grossTotal)}
            ton="gold"
          />
          <Kennzahl
            icon={Euro}
            label="davon netto"
            wert={formatPrice(heute.netTotal)}
            ton="neutral"
          />
          <Kennzahl
            icon={Banknote}
            label="bar"
            wert={formatPrice(bar)}
            ton="neutral"
          />
          <Kennzahl
            icon={CreditCard}
            label="Karte"
            wert={formatPrice(karte)}
            ton="neutral"
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow text-muted-foreground">
            Laufender Monat und Forderungen
          </h2>
          <Link
            href="/kasse/umsaetze"
            className="text-sm text-brand hover:underline"
          >
            Umsätze nach Zeitraum
          </Link>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Kennzahl
            icon={Euro}
            label="Kasse im Monat brutto"
            wert={formatPrice(monat.grossTotal)}
            ton="brand"
            href="/kasse/umsaetze?zeitraum=monat&gruppe=tag"
          />
          <Kennzahl
            icon={Receipt}
            label="Belege im Monat"
            wert={formatQuantity(monat.salesCount)}
            ton="neutral"
            href="/kasse/umsaetze?zeitraum=monat&gruppe=tag"
          />
          <Kennzahl
            icon={FileText}
            label={
              offen.length === 1
                ? "1 offene Rechnung"
                : `${formatQuantity(offen.length)} offene Rechnungen`
            }
            wert={formatPrice(offenerBetrag)}
            ton={offen.length > 0 ? "signal" : "neutral"}
            href="/kasse/rechnungen?status=open"
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow text-muted-foreground">Tagesabschluss</h2>
          <Link
            href="/kasse/tagesabschluss"
            className="text-sm text-brand hover:underline"
          >
            alle Tage ansehen
          </Link>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Kennzahl
            icon={CalendarCheck}
            label={
              heutigerAbschluss
                ? `Heute abgeschlossen · ${heutigerAbschluss.z_number}`
                : "Heute noch nicht abgeschlossen"
            }
            wert={formatPrice(heute.grossTotal)}
            ton={heutigerAbschluss ? "neutral" : "gold"}
            href="/kasse/tagesabschluss"
          />
          <Kennzahl
            icon={Receipt}
            label={
              letzterAbschluss
                ? `Letzter Abschluss · ${letzterAbschluss.z_number}`
                : "Noch kein Tagesabschluss"
            }
            wert={
              letzterAbschluss
                ? formatPrice(letzterAbschluss.gross_amount)
                : "–"
            }
            ton="neutral"
            href="/kasse/tagesabschluss"
          />
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Letzte Belege</h2>
            <Link
              href="/kasse/verkaeufe"
              className="text-sm text-brand hover:underline"
            >
              alle ansehen
            </Link>
          </div>

          {letzteBons.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Über die Kasse wurde noch nichts verkauft.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {letzteBons.map((sale) => (
                <li
                  key={sale.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular">
                      {sale.receipt_number}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(sale.created_at)} ·{" "}
                      {uhrzeit.format(new Date(sale.created_at))} Uhr ·{" "}
                      {POS_PAYMENT_LABELS[sale.payment_method]} ·{" "}
                      {sale.customer?.company_name ||
                        sale.customer?.full_name ||
                        sale.customer_label ||
                        "Barverkauf"}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular">
                    {formatPrice(sale.total_amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-medium">Meistverkauft an der Kasse</h2>
          <p className="text-xs text-muted-foreground">letzte 30 Tage</p>
          {topProdukte.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Noch keine Kassenverkäufe.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {topProdukte.map((product) => (
                <li key={product.sku} className="flex justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="code text-xs text-muted-foreground">
                      {product.sku}
                    </p>
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
    </div>
  );
}

function Kennzahl({
  icon: Icon,
  label,
  wert,
  ton,
  href,
}: {
  icon: LucideIcon;
  label: string;
  wert: string;
  ton: "gold" | "brand" | "signal" | "neutral";
  href?: string;
}) {
  const flaeche = {
    gold: "border-gold/50 bg-gold-soft",
    brand: "border-brand/40 bg-brand-soft",
    signal: "border-signal/40 bg-signal-soft",
    neutral: "border-border bg-card",
  }[ton];

  const symbol = {
    gold: "bg-gold text-gold-foreground",
    brand: "bg-brand text-brand-foreground",
    signal: "bg-signal text-signal-foreground",
    neutral: "bg-muted text-muted-foreground",
  }[ton];

  const zahl = {
    gold: "text-gold",
    brand: "text-brand",
    signal: "text-signal",
    neutral: "",
  }[ton];

  const inhalt = (
    <>
      <span>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className={`mt-1 block text-2xl font-semibold tabular ${zahl}`}>
          {wert}
        </span>
      </span>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${symbol}`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
    </>
  );

  const klassen = `flex items-start justify-between gap-3 rounded-lg border-2 p-4 ${flaeche}`;

  if (href) {
    return (
      <Link href={href} className={`card-hover ${klassen}`}>
        {inhalt}
      </Link>
    );
  }
  return <div className={klassen}>{inhalt}</div>;
}
