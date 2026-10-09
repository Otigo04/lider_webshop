"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageOff, Pencil, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  artikelAuskunft,
  type ArtikelAuskunft,
  type AuskunftErgebnis,
} from "@/lib/actions/artikelinfo";
import { formatPrice, formatQuantity } from "@/lib/format";
import { LOW_STOCK_THRESHOLD, marge } from "@/lib/pricing";

const DATUM = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** Wie viele Scans in der Liste darunter stehen bleiben. */
const VERLAUF = 8;

/**
 * Artikelauskunft: ein Feld, das immer den Fokus hat, und darunter der Artikel
 * zum zuletzt gescannten Code.
 *
 * Der Scanner tippt den Code und sendet Enter – das Formular braucht dazu
 * nichts weiter. Nach jedem Scan wird das Feld geleert und behält den Fokus,
 * sonst müsste man vor jedem Etikett zur Maus greifen. Scannt jemand schneller,
 * als die Antwort kommt, gilt die Antwort des **letzten** Scans.
 */
export function ArtikelInfo() {
  const feld = useRef<HTMLInputElement>(null);
  const zaehler = useRef(0);
  const [code, setCode] = useState("");
  const [lade, setLade] = useState(false);
  const [ergebnis, setErgebnis] = useState<AuskunftErgebnis | null>(null);
  const [verlauf, setVerlauf] = useState<
    { code: string; name: string | null }[]
  >([]);

  useEffect(() => feld.current?.focus(), []);

  async function suche(roh: string) {
    const gesucht = roh.trim();
    if (!gesucht) return;
    const nummer = ++zaehler.current;
    setLade(true);
    setCode("");

    let antwort: AuskunftErgebnis;
    try {
      antwort = await artikelAuskunft(gesucht);
    } catch {
      antwort = { fehler: "Keine Verbindung. Bitte noch einmal scannen." };
    }
    if (nummer !== zaehler.current) return;

    setErgebnis(antwort);
    setLade(false);
    setVerlauf((alt) =>
      [
        {
          code: gesucht,
          name: "treffer" in antwort ? antwort.treffer.name : null,
        },
        ...alt.filter((eintrag) => eintrag.code !== gesucht),
      ].slice(0, VERLAUF),
    );
    feld.current?.focus();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void suche(code);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <ScanBarcode
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={feld}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Barcode scannen oder Artikelnummer eingeben"
            aria-label="Barcode oder Artikelnummer"
            autoComplete="off"
            inputMode="text"
            className="h-12 pl-11 text-lg"
            // Der Fokus bleibt im Feld: ein Klick daneben soll das Scannen
            // nicht unterbrechen.
            onBlur={() => window.setTimeout(() => feld.current?.focus(), 150)}
          />
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={lade || !code.trim()}>
          Anzeigen
        </Button>
      </form>

      {ergebnis === null ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          Noch nichts gescannt.
        </p>
      ) : "treffer" in ergebnis ? (
        <Auskunft a={ergebnis.treffer} veraltet={lade} />
      ) : "unbekannt" in ergebnis ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-8">
          <p className="text-lg font-semibold text-destructive">
            Kein Artikel mit diesem Code
          </p>
          <p className="code mt-1 text-sm">{ergebnis.unbekannt}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Der Code steht weder als Barcode noch als Artikelnummer im Stamm.
            Neue Ware legst du im{" "}
            <Link href="/admin/bestand" className="underline">
              Wareneingang
            </Link>{" "}
            an.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          {ergebnis.fehler}
        </p>
      )}

      {verlauf.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Zuletzt gescannt</h2>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
            {verlauf.map((eintrag) => (
              <li key={eintrag.code}>
                <button
                  type="button"
                  onClick={() => void suche(eintrag.code)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="min-w-0 truncate font-medium">
                    {eintrag.name ?? (
                      <span className="text-destructive">unbekannt</span>
                    )}
                  </span>
                  <span className="code shrink-0 text-xs text-muted-foreground">
                    {eintrag.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Auskunft({ a, veraltet }: { a: ArtikelAuskunft; veraltet: boolean }) {
  const stufe = a.frei <= 0 ? "aus" : a.frei < LOW_STOCK_THRESHOLD ? "knapp" : "ok";
  // Marge auf den Ladenpreis; ohne den den besten Großhandelspreis.
  const verkauf = a.laden ?? a.staffeln[a.staffeln.length - 1]?.preis ?? null;
  const m = marge(verkauf, a.einkauf);
  const farbe = {
    aus: "border-destructive/40 bg-destructive/5 text-destructive",
    knapp: "border-warning/40 bg-warning/10 text-warning",
    ok: "border-success/40 bg-success/10 text-success",
  }[stufe];

  return (
    <article
      className={`grid gap-6 rounded-lg border border-border p-5 sm:grid-cols-[16rem_minmax(0,1fr)] ${
        veraltet ? "opacity-60" : ""
      }`}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-white">
        {a.bildUrl ? (
          <Image
            src={a.bildUrl}
            alt={a.name}
            width={512}
            height={512}
            sizes="256px"
            className="size-full object-contain"
          />
        ) : (
          <ImageOff className="size-10 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {a.kategorie ? (
              <span className="text-muted-foreground">{a.kategorie}</span>
            ) : null}
            {a.neu ? (
              <span className="rounded bg-brand px-1.5 py-px font-medium text-brand-foreground">
                Neu
              </span>
            ) : null}
            {a.topseller ? (
              <span className="rounded bg-gold px-1.5 py-px font-medium text-white">
                Topseller
              </span>
            ) : null}
            {!a.aktiv ? (
              <span className="rounded border border-border px-1.5 py-px text-muted-foreground">
                im Shop ausgeblendet
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 text-2xl font-semibold leading-tight">{a.name}</h2>
          {a.gruppe ? (
            <p className="text-sm text-muted-foreground">Ausführung von „{a.gruppe}“</p>
          ) : null}
          <p className="code mt-1 text-sm text-muted-foreground">
            Art.-Nr. {a.sku}
            {a.barcode ? ` · ${a.barcode}` : ""}
          </p>
        </div>

        <div className={`rounded-lg border px-4 py-3 ${farbe}`}>
          <p className="text-3xl font-semibold tabular">
            {formatQuantity(a.frei)}{" "}
            <span className="text-base font-medium">
              {a.frei <= 0 ? "– ausverkauft" : "verfügbar"}
            </span>
          </p>
          <p className="text-xs tabular opacity-80">
            Lager {formatQuantity(a.gesamt)}
            {a.reserviert > 0 ? ` · davon reserviert ${formatQuantity(a.reserviert)}` : ""}
          </p>
        </div>

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Ladenpreis</dt>
            <dd className="tabular">
              {a.laden !== null ? (
                <>
                  <span className="text-lg font-semibold">{formatPrice(a.laden)}</span>
                  {a.vorher !== null && a.vorher > a.laden ? (
                    <s className="ml-2 text-muted-foreground">{formatPrice(a.vorher)}</s>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">nicht gepflegt</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Großhandel (netto)
            </dt>
            <dd className="tabular">
              {a.staffeln.length > 0 ? (
                <ul>
                  {a.staffeln.map((s) => (
                    <li key={s.ab}>
                      ab {formatQuantity(s.ab)} Stk.{" "}
                      <span className="font-semibold">{formatPrice(s.preis)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">keine Staffel</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Einkaufspreis <span className="font-normal">(intern)</span>
            </dt>
            <dd className="tabular">
              {a.einkauf !== null ? (
                <>
                  <span className="text-lg font-semibold">{formatPrice(a.einkauf)}</span>
                  {m ? (
                    <span className="ml-2 text-muted-foreground">
                      Marge {m.prozent} %
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">nicht gepflegt</span>
              )}
            </dd>
          </div>
        </dl>

        {a.zugaenge.length > 0 ? (
          <p className="text-xs text-muted-foreground tabular">
            Letzte Wareneingänge:{" "}
            {a.zugaenge
              .map(
                (z) =>
                  `${DATUM.format(new Date(z.am))} ${z.menge > 0 ? "+" : ""}${formatQuantity(z.menge)}`,
              )
              .join(" · ")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/products/${a.id}/edit`}>
              <Pencil className="size-4" aria-hidden /> Artikel bearbeiten
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
