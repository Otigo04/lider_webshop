"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, ImageOff, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { katalogPreis, type KatalogArtikel } from "@/lib/katalog";

/** Wie viele Treffer die Liste zeigt, bevor sie zur Bleiwüste wird. */
const MAX_TREFFER = 80;

type Kennzeichen = "reduziert" | "neu" | "topseller";

const KENNZEICHEN: { key: Kennzeichen; name: string }[] = [
  { key: "reduziert", name: "Reduziert" },
  { key: "neu", name: "Neu" },
  { key: "topseller", name: "Topseller" },
];

/**
 * Linke Spalte der Katalog-Werkbank: Artikel finden und hinzufügen.
 *
 * Gesucht wird im Browser, wortweise wie überall im Artikelstamm
 * (lib/search.ts): jedes Wort muss in Bezeichnung, Artikelnummer oder Barcode
 * vorkommen, die Reihenfolge ist gleich.
 *
 * Ein Klick fügt hinzu, ein zweiter nimmt wieder heraus – anders als beim
 * Preisschild, wo der zweite Klick „noch eins" heißt. Ein Artikel steht im
 * Katalog einmal.
 */
export function KatalogArtikelSuche({
  artikel,
  enthalten,
  onHinzufuegen,
  onEntfernen,
}: {
  artikel: KatalogArtikel[];
  enthalten: Set<string>;
  onHinzufuegen: (ids: string[]) => void;
  onEntfernen: (ids: string[]) => void;
}) {
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [kennzeichen, setKennzeichen] = useState<Kennzeichen | null>(null);

  const kategorien = useMemo(() => {
    const karte = new Map<string, { name: string; rang: number }>();
    for (const a of artikel) {
      karte.set(a.kategorieId, { name: a.kategorie, rang: a.kategorieRang });
    }
    return [...karte].sort(
      (a, b) =>
        a[1].rang - b[1].rang || a[1].name.localeCompare(b[1].name, "de"),
    );
  }, [artikel]);

  const treffer = useMemo(() => {
    const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return artikel.filter((a) => {
      if (kategorie && a.kategorieId !== kategorie) return false;
      if (kennzeichen === "neu" && !a.neu) return false;
      if (kennzeichen === "topseller" && !a.topseller) return false;
      if (kennzeichen === "reduziert" && !katalogPreis(a, "laden")?.reduziert) {
        return false;
      }
      if (woerter.length === 0) return true;
      const text = `${a.name} ${a.sku} ${a.barcode ?? ""}`.toLowerCase();
      return woerter.every((wort) => text.includes(wort));
    });
  }, [artikel, suche, kategorie, kennzeichen]);

  const fehlend = treffer.filter((a) => !enthalten.has(a.id));
  const gefiltert = suche.trim() !== "" || kategorie !== "" || kennzeichen !== null;
  const nurWarengruppe =
    kategorie !== "" && suche.trim() === "" && kennzeichen === null;

  return (
    <aside className="space-y-3">
      <h2 className="text-sm font-semibold">Artikel hinzufügen</h2>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
          placeholder="Bezeichnung, Nummer, Barcode"
          aria-label="Artikel suchen"
          className="pl-8"
        />
      </div>

      <select
        value={kategorie}
        onChange={(event) => setKategorie(event.target.value)}
        aria-label="Warengruppe"
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Alle Warengruppen</option>
        {kategorien.map(([id, k]) => (
          <option key={id} value={id}>
            {k.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1">
        {KENNZEICHEN.map((k) => {
          const an = kennzeichen === k.key;
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={an}
              onClick={() => setKennzeichen(an ? null : k.key)}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                an
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {k.name}
            </button>
          );
        })}
      </div>

      {/* Ohne Filter gibt es den Knopf nicht: „alle Treffer" wäre dann der
          ganze Artikelstamm, und das ist ein Klick, den man nicht aus
          Versehen machen soll. */}
      {gefiltert && fehlend.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onHinzufuegen(fehlend.map((a) => a.id))}
        >
          <Plus aria-hidden />
          {nurWarengruppe
            ? `Ganze Warengruppe (${fehlend.length})`
            : `Alle ${fehlend.length} Treffer`}
        </Button>
      ) : null}

      <ul className="max-h-[36rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {treffer.slice(0, MAX_TREFFER).map((a) => {
          const drin = enthalten.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => (drin ? onEntfernen([a.id]) : onHinzufuegen([a.id]))}
                aria-pressed={drin}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-muted ${
                  drin ? "bg-brand-soft/60" : ""
                }`}
              >
                <Vorschaubild url={a.bildUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {a.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground tabular">
                    {a.sku} · {a.kategorie}
                  </span>
                </span>
                {drin ? (
                  <Check className="size-4 shrink-0 text-brand" aria-hidden />
                ) : (
                  <Plus
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
        {treffer.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Kein Artikel gefunden.
          </li>
        ) : null}
      </ul>

      {treffer.length > MAX_TREFFER ? (
        <p className="text-xs text-muted-foreground tabular">
          {MAX_TREFFER} von {treffer.length} Treffern – Suche eingrenzen.
        </p>
      ) : null}
    </aside>
  );
}

/** Kleines Foto; ohne Bild ein Zeichen dafür, dass es fehlt. */
export function Vorschaubild({ url }: { url: string | null }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white">
      {url ? (
        <Image
          src={url}
          alt=""
          width={36}
          height={36}
          sizes="36px"
          className="size-full object-contain"
        />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
