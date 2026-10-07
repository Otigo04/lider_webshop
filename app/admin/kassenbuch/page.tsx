import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { KassenbuchForm } from "@/components/admin/kassenbuch-form";
import { deleteCashEntry } from "@/lib/actions/admin-kassenbuch";
import { requireAdmin } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { getCashEntries, heuteBerlin } from "@/lib/queries/kassenbuch";

export const metadata: Metadata = { title: "Kassenbuch" };

const MONAT_MUSTER = /^\d{4}-(0[1-9]|1[0-2])$/;

function monatVersetzt(monat: string, delta: number): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const monatsname = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const tagesname = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export default async function KassenbuchPage({
  searchParams,
}: PageProps<"/admin/kassenbuch">) {
  await requireAdmin();
  const params = await searchParams;
  const heute = heuteBerlin();

  const editDatum = typeof params.edit === "string" ? params.edit : null;
  const roh = typeof params.monat === "string" ? params.monat : "";
  const monat = MONAT_MUSTER.test(roh)
    ? roh
    : editDatum && /^\d{4}-\d{2}-\d{2}$/.test(editDatum)
      ? editDatum.slice(0, 7)
      : heute.slice(0, 7);

  const eintraege = await getCashEntries(monat);
  const vorgabe = eintraege.find((e) => e.entry_date === editDatum) ?? null;

  const summe = eintraege.reduce(
    (s, e) => ({
      cash: s.cash + e.cash,
      card: s.card + e.card,
      wholesale: s.wholesale + e.wholesale,
    }),
    { cash: 0, card: 0, wholesale: 0 },
  );
  const gesamt = summe.cash + summe.card + summe.wholesale;

  const monatDate = new Date(`${monat}-01T00:00:00Z`);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Kassenbuch</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tageskasse von Hand: Bargeld, Karte und Großhandel je Tag. Unabhängig
        von Kasse und Tagesabschluss.
      </p>

      <div className="mt-6">
        <KassenbuchForm
          vorgabe={vorgabe}
          eintraege={eintraege}
          heute={heute}
          monat={monat}
        />
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold capitalize">{monatsname.format(monatDate)}</h2>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/kassenbuch?monat=${monatVersetzt(monat, -1)}`}
            aria-label="Vorheriger Monat"
            className="rounded-md border border-border p-2 hover:bg-muted"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link
            href="/admin/kassenbuch"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Heute
          </Link>
          <Link
            href={`/admin/kassenbuch?monat=${monatVersetzt(monat, 1)}`}
            aria-label="Nächster Monat"
            className="rounded-md border border-border p-2 hover:bg-muted"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Bargeld", summe.cash],
          ["Karte", summe.card],
          ["Großhandel", summe.wholesale],
          ["Gesamt", gesamt],
        ].map(([label, wert], i) => (
          <div
            key={label}
            className={`rounded-md border px-3 py-2 ${i === 3 ? "border-brand/30 bg-brand-soft" : "border-border"}`}
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular">{formatPrice(wert as number)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 overflow-x-auto">
        {eintraege.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            Für diesen Monat gibt es noch keine Einträge.
          </p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="px-3 py-2 text-right font-medium">Bargeld</th>
                <th className="px-3 py-2 text-right font-medium">Karte</th>
                <th className="px-3 py-2 text-right font-medium">Großhandel</th>
                <th className="px-3 py-2 text-right font-medium">Summe</th>
                <th className="px-3 py-2 font-medium">Notiz</th>
                <th className="py-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => (
                <tr key={e.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="whitespace-nowrap py-2 pr-3">
                    <Link
                      href={`/admin/kassenbuch?edit=${e.entry_date}`}
                      className="font-medium hover:underline"
                    >
                      {tagesname.format(new Date(`${e.entry_date}T00:00:00Z`))}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular">{formatPrice(e.cash)}</td>
                  <td className="px-3 py-2 text-right tabular">{formatPrice(e.card)}</td>
                  <td className="px-3 py-2 text-right tabular">{formatPrice(e.wholesale)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular">
                    {formatPrice(e.cash + e.card + e.wholesale)}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-muted-foreground">
                    {e.note}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <ConfirmAction
                      action={deleteCashEntry}
                      fields={{ id: e.id }}
                      title="Eintrag löschen?"
                      description={`Der Eintrag vom ${tagesname.format(new Date(`${e.entry_date}T00:00:00Z`))} wird entfernt.`}
                      confirmLabel="Löschen"
                      destructive
                      trigger={
                        <button
                          type="button"
                          aria-label="Eintrag löschen"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-signal"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
