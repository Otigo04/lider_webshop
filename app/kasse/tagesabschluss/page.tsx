import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Euro,
  Printer,
  Receipt,
  Trash2,
} from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { AbschluesseZuruecksetzen } from "@/components/kasse/abschluesse-zuruecksetzen";
import { TagAbschliessenButton } from "@/components/kasse/tag-abschliessen-button";
import { Button } from "@/components/ui/button";
import { abschlussLoeschen } from "@/lib/actions/kasse";
import { formatPrice, formatQuantity } from "@/lib/format";
import {
  getKassenHeute,
  getKassentage,
  holeAbschluesseNach,
  type Kassentag,
} from "@/lib/queries/kasse";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tagesabschluss" };

const MONATSNAME = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});

const WOCHENTAG = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

const TAGESDATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const UHRZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Ein Kassentag ist ein Datum ohne Uhrzeit. Ihn über `new Date("2026-09-05")`
 * zu lesen ergäbe UTC-Mitternacht und damit in Ortszeit den Vortag – deshalb
 * wird er stückweise als lokales Datum gebaut.
 */
function alsDatum(tag: string): Date {
  const [jahr, monat, tagImMonat] = tag.split("-").map(Number);
  return new Date(jahr, monat - 1, tagImMonat);
}

function monatsGrenzen(monat: string): { von: string; bis: string } {
  const [jahr, m] = monat.split("-").map(Number);
  const letzterTag = new Date(jahr, m, 0).getDate();
  return {
    von: `${monat}-01`,
    bis: `${monat}-${String(letzterTag).padStart(2, "0")}`,
  };
}

function monatVerschieben(monat: string, um: number): string {
  const [jahr, m] = monat.split("-").map(Number);
  const datum = new Date(jahr, m - 1 + um, 1);
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}`;
}

function istMonat(wert: unknown): wert is string {
  return typeof wert === "string" && /^\d{4}-\d{2}$/.test(wert);
}

/**
 * Tagesabschlüsse der Ladenkasse.
 *
 * Ein Monat je Seite: so steht die Buchhaltung im selben Raster, in dem sie
 * ohnehin geführt wird, und die Liste bleibt kurz genug, um sie zu überblicken.
 *
 * Beim Aufruf werden vergessene Abschlüsse nachgeholt (siehe
 * lib/queries/kasse.ts). Das ist ein Schreibvorgang beim Rendern – bewusst,
 * denn er ist idempotent, betrifft nur abgelaufene Tage und erspart einen
 * Scheduler, der still ausfallen könnte.
 */
export default async function TagesabschlussPage({
  searchParams,
}: PageProps<"/kasse/tagesabschluss">) {
  const params = await searchParams;
  await holeAbschluesseNach();

  const heute = await getKassenHeute();
  const monat = istMonat(params.monat) ? params.monat : heute.slice(0, 7);
  const { von, bis } = monatsGrenzen(monat);

  const tage = await getKassentage(von, bis);
  const heutigerTag = tage.find((tag) => tag.datum === heute) ?? null;

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

  const offeneTage = tage.filter(
    (tag) =>
      !tag.laufend && !tag.ausgenommen && tag.abschluss === null && tag.bons > 0,
  );
  const ausgenommene = tage.filter(
    (tag) => tag.ausgenommen && tag.abschluss === null && tag.bons > 0,
  );
  const abschluesseImMonat = tage.filter((tag) => tag.abschluss !== null).length;
  const naechsterMonat = monatVerschieben(monat, 1);
  const zukunft = naechsterMonat > heute.slice(0, 7);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tagesabschluss</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jeder Kassentag mit seiner Z-Nummer. Vergangene Tage werden beim
            Öffnen dieser Seite automatisch abgeschlossen.
          </p>
        </div>

        <nav aria-label="Monat wählen" className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" title="Voriger Monat">
            <Link
              href={`/kasse/tagesabschluss?monat=${monatVerschieben(monat, -1)}`}
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span className="sr-only">Voriger Monat</span>
            </Link>
          </Button>
          <span className="min-w-40 px-2 text-center text-sm font-medium">
            {MONATSNAME.format(alsDatum(`${monat}-01`))}
          </span>
          {/* Kein Vorwärts über den laufenden Monat hinaus – dort steht nichts. */}
          {zukunft ? (
            <Button variant="outline" size="icon" disabled title="Nächster Monat">
              <ChevronRight className="size-4" aria-hidden />
              <span className="sr-only">Nächster Monat</span>
            </Button>
          ) : (
            <Button asChild variant="outline" size="icon" title="Nächster Monat">
              <Link href={`/kasse/tagesabschluss?monat=${naechsterMonat}`}>
                <ChevronRight className="size-4" aria-hidden />
                <span className="sr-only">Nächster Monat</span>
              </Link>
            </Button>
          )}
        </nav>
      </div>

      {/* ------------------------------------------------------------ Heute */}
      <section className="mt-8 rounded-lg border-2 border-gold/50 bg-gold-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-gold">Heute · {TAGESDATUM.format(alsDatum(heute))}</p>
            <p className="mt-2 text-3xl font-bold tabular text-gold">
              {formatPrice(heutigerTag?.brutto ?? 0)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground tabular">
              {formatQuantity(heutigerTag?.bons ?? 0)}{" "}
              {(heutigerTag?.bons ?? 0) === 1 ? "Beleg" : "Belege"} ·{" "}
              {formatPrice(heutigerTag?.bar ?? 0)} bar ·{" "}
              {formatPrice(heutigerTag?.karte ?? 0)} Karte
            </p>
            {heutigerTag?.abschluss ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Bereits abgeschlossen als{" "}
                <span className="font-medium tabular">
                  {heutigerTag.abschluss.z_number}
                </span>{" "}
                um {UHRZEIT.format(new Date(heutigerTag.abschluss.closed_at))} Uhr.
                {heutigerTag.abweichend
                  ? " Seitdem wurde weiter verkauft – neu abschließen."
                  : ""}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <TagAbschliessenButton
              datum={heute}
              label={`${WOCHENTAG.format(alsDatum(heute))}, ${TAGESDATUM.format(alsDatum(heute))}`}
              neu={heutigerTag?.abschluss !== null && heutigerTag !== null}
              laufend
            />
            {heutigerTag?.abschluss ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/kasse/tagesabschluss/${heute}/bon`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Printer className="size-4" aria-hidden /> Z-Bon
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {offeneTage.length > 0 ? (
        <p className="mt-4 rounded-md border border-signal/40 bg-signal-soft px-3 py-2 text-sm text-signal">
          {offeneTage.length === 1
            ? "Ein vergangener Tag ist noch offen"
            : `${offeneTage.length} vergangene Tage sind noch offen`}{" "}
          – das Nachholen ist fehlgeschlagen. Die Tage lassen sich unten einzeln
          abschließen.
        </p>
      ) : null}

      {ausgenommene.length > 0 ? (
        <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {ausgenommene.length === 1
            ? "Ein Tag wird nicht mehr automatisch abgeschlossen"
            : `${ausgenommene.length} Tage werden nicht mehr automatisch abgeschlossen`}
          , weil ihr Abschluss gelöscht wurde. Von Hand geht es weiterhin.
        </p>
      ) : null}

      {/* ------------------------------------------------------ Monatsliste */}
      {tage.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          In diesem Monat wurde über die Kasse nichts verkauft.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Tag</th>
                <th className="py-2 pr-3 font-medium">Z-Nr.</th>
                <th className="py-2 pr-3 text-right font-medium">Belege</th>
                <th className="py-2 pr-3 text-right font-medium">Bar</th>
                <th className="py-2 pr-3 text-right font-medium">Karte</th>
                <th className="py-2 pr-3 text-right font-medium">Netto</th>
                <th className="py-2 pr-3 text-right font-medium">Brutto</th>
                <th className="py-2 text-right font-medium">Abschluss</th>
              </tr>
            </thead>
            <tbody>
              {tage.map((tag) => (
                <Tageszeile key={tag.datum} tag={tag} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-3 pr-3" colSpan={2}>
                  Summe {MONATSNAME.format(alsDatum(`${monat}-01`))}
                </td>
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
                <td className="py-3 pr-3 text-right tabular">
                  {formatPrice(summe.brutto)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {abschluesseImMonat > 0 ? (
        <div className="mt-4 flex justify-end">
          <AbschluesseZuruecksetzen anzahl={abschluesseImMonat} />
        </div>
      ) : null}

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Kennzahl
          icon={Euro}
          label="Monatsumsatz brutto"
          wert={formatPrice(summe.brutto)}
        />
        <Kennzahl icon={Banknote} label="davon bar" wert={formatPrice(summe.bar)} />
        <Kennzahl
          icon={CreditCard}
          label="davon Karte"
          wert={formatPrice(summe.karte)}
        />
      </section>
    </div>
  );
}

function Tageszeile({ tag }: { tag: Kassentag }) {
  const datum = alsDatum(tag.datum);

  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        tag.laufend && "bg-gold-soft/40",
      )}
    >
      <td className="whitespace-nowrap py-2.5 pr-3">
        <span className="font-medium tabular">{TAGESDATUM.format(datum)}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {WOCHENTAG.format(datum)}
        </span>
      </td>

      <td className="py-2.5 pr-3">
        {tag.abschluss ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-medium tabular">{tag.abschluss.z_number}</span>
            {tag.abschluss.closed_by === null ? (
              <span
                className="rounded border border-border bg-muted px-1 py-px text-xs text-muted-foreground"
                title="Beim Öffnen der Kasse nachgeholt"
              >
                auto
              </span>
            ) : null}
          </span>
        ) : tag.laufend ? (
          <span className="text-xs text-muted-foreground">läuft</span>
        ) : (
          <span className="text-xs text-signal">offen</span>
        )}
        {tag.abweichend ? (
          <p className="mt-0.5 text-xs text-signal">
            nach Abschluss gebucht ({formatPrice(tag.abschluss!.gross_amount)}{" "}
            festgeschrieben)
          </p>
        ) : null}
        {tag.abschluss?.note ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tag.abschluss.note}
          </p>
        ) : null}
      </td>

      <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
        {formatQuantity(tag.bons)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular">{formatPrice(tag.bar)}</td>
      <td className="py-2.5 pr-3 text-right tabular">{formatPrice(tag.karte)}</td>
      <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
        {formatPrice(tag.netto)}
      </td>
      <td className="py-2.5 pr-3 text-right font-semibold tabular">
        {formatPrice(tag.brutto)}
      </td>

      <td className="py-2.5 text-right">
        <div className="flex justify-end gap-1">
          {tag.abschluss === null || tag.abweichend ? (
            <TagAbschliessenButton
              datum={tag.datum}
              label={`${WOCHENTAG.format(datum)}, ${TAGESDATUM.format(datum)}`}
              neu={tag.abweichend}
              laufend={tag.laufend}
              variante={tag.abschluss === null ? "secondary" : "outline"}
            />
          ) : null}
          {tag.abschluss ? (
            <>
              <Button asChild variant="ghost" size="sm" title="Z-Bon drucken">
                <a
                  href={`/kasse/tagesabschluss/${tag.datum}/bon`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Receipt className="size-4" aria-hidden />
                  <span className="sr-only">
                    Z-Bon für {TAGESDATUM.format(datum)}
                  </span>
                </a>
              </Button>
              <ConfirmAction
                action={abschlussLoeschen}
                fields={{ datum: tag.datum }}
                title={`Abschluss ${tag.abschluss.z_number} löschen?`}
                description={`Die Festschreibung des ${TAGESDATUM.format(datum)} wird zurückgenommen. Die Verkäufe des Tages bleiben erhalten, der Tag lässt sich neu abschließen. Die Nummer ${tag.abschluss.z_number} bleibt verbraucht, und der Tag wird nicht mehr automatisch abgeschlossen.`}
                confirmLabel="Löschen"
                destructive
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Abschluss löschen"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">
                      Abschluss {tag.abschluss.z_number} löschen
                    </span>
                  </Button>
                }
              />
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function Kennzahl({
  icon: Icon,
  label,
  wert,
}: {
  icon: typeof Euro;
  label: string;
  wert: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <span>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className="mt-1 block text-2xl font-semibold tabular">{wert}</span>
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
    </div>
  );
}
