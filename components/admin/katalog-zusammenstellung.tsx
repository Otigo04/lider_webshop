"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Vorschaubild } from "@/components/admin/katalog-artikel-suche";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import {
  BALD_SLUG,
  katalogPreis,
  sortiere,
  type KatalogArtikel,
  type KatalogPreisart,
} from "@/lib/katalog";

type Filter = "foto" | "preis" | "ausverkauft" | "ausgeblendet";

/**
 * Mittlere Spalte: was im Katalog steht, nach Warengruppe gegliedert – in
 * der Reihenfolge, in der es gedruckt wird.
 *
 * Verschoben wird mit Auf und Ab, nicht durch Ziehen: bei dreihundert Zeilen
 * ist Ziehen über mehrere Bildschirmhöhen kein Werkzeug.
 *
 * Die Leiste darüber trennt, was **fehlen** wird (kein Foto, kein Preis), von
 * dem, was nur auffällt (ausverkauft, im Shop ausgeblendet). Das eine ist
 * eine Lücke im Katalog, das andere eine Auskunft.
 */
export function KatalogZusammenstellung({
  artikel,
  gewaehlt,
  preisart,
  ohneFoto,
  ohnePreis,
  onHinzufuegen,
  onEntfernen,
  onVerschieben,
  onBald,
}: {
  artikel: KatalogArtikel[];
  gewaehlt: KatalogArtikel[];
  preisart: KatalogPreisart;
  ohneFoto: string[];
  ohnePreis: string[];
  onHinzufuegen: (ids: string[]) => void;
  onEntfernen: (ids: string[]) => void;
  onVerschieben: (id: string, richtung: -1 | 1) => void;
  onBald: (ids: string[], an: boolean) => void;
}) {
  const [filter, setFilter] = useState<Filter | null>(null);

  const fehlt = useMemo(
    () => ({ foto: new Set(ohneFoto), preis: new Set(ohnePreis) }),
    [ohneFoto, ohnePreis],
  );
  // Kommende Ware hat noch keinen Bestand – das ist keine Auskunft wert.
  const istBald = (a: KatalogArtikel) => a.kategorieSlug === BALD_SLUG;
  const ausverkauft = gewaehlt.filter((a) => !istBald(a) && a.bestand <= 0).length;
  const ausgeblendet = gewaehlt.filter((a) => !a.aktiv).length;

  const trifft = (a: KatalogArtikel, f: Filter) =>
    f === "foto"
      ? fehlt.foto.has(a.id)
      : f === "preis"
        ? fehlt.preis.has(a.id)
        : f === "ausverkauft"
          ? !istBald(a) && a.bestand <= 0
          : !a.aktiv;

  // Ein Filter, dessen Fälle gerade behoben wurden, zeigte eine leere Liste
  // ohne erkennbaren Grund – dann gilt er nicht mehr.
  const aktiv = filter && gewaehlt.some((a) => trifft(a, filter)) ? filter : null;

  const abschnitte = useMemo(() => {
    const liste: { id: string; name: string; artikel: KatalogArtikel[] }[] = [];
    for (const a of sortiere(gewaehlt)) {
      const letzter = liste[liste.length - 1];
      if (letzter && letzter.id === a.kategorieId) letzter.artikel.push(a);
      else liste.push({ id: a.kategorieId, name: a.kategorie, artikel: [a] });
    }
    return liste;
  }, [gewaehlt]);

  const drin = useMemo(() => new Set(gewaehlt.map((a) => a.id)), [gewaehlt]);

  const hinweise: { key: Filter; anzahl: number; text: string; ernst: boolean }[] = [
    { key: "foto", anzahl: ohneFoto.length, text: "ohne Foto – fehlen im Katalog", ernst: true },
    {
      key: "preis",
      anzahl: ohnePreis.length,
      text:
        preisart === "laden"
          ? "ohne Ladenpreis – fehlen im Katalog"
          : "ohne Staffelpreis – fehlen im Katalog",
      ernst: true,
    },
    { key: "ausverkauft", anzahl: ausverkauft, text: "ausverkauft", ernst: false },
    { key: "ausgeblendet", anzahl: ausgeblendet, text: "im Shop ausgeblendet", ernst: false },
  ];
  const sichtbar = hinweise.filter((h) => h.anzahl > 0);

  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-sm font-semibold">
        Zusammenstellung{" "}
        <span className="font-normal text-muted-foreground tabular">
          · {gewaehlt.length} Artikel
        </span>
      </h2>

      {sichtbar.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sichtbar.map((h) => {
            const an = aktiv === h.key;
            return (
              <button
                key={h.key}
                type="button"
                aria-pressed={an}
                onClick={() => setFilter(an ? null : h.key)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium tabular transition-colors ${
                  h.ernst
                    ? an
                      ? "border-destructive bg-destructive text-white"
                      : "border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
                    : an
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {h.anzahl} {h.text}
              </button>
            );
          })}
        </div>
      ) : null}

      {gewaehlt.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Noch nichts ausgewählt. Links eine Warengruppe wählen und als Ganzes
          übernehmen, oder einzelne Artikel anklicken.
        </p>
      ) : null}

      {abschnitte.map((abschnitt) => {
        const zeilen = aktiv
          ? abschnitt.artikel.filter((a) => trifft(a, aktiv))
          : abschnitt.artikel;
        if (zeilen.length === 0) return null;

        // Artikel der Warengruppe, die seit dem Zusammenstellen dazukamen.
        const nachzuholen = artikel.filter(
          (a) => a.kategorieId === abschnitt.id && !drin.has(a.id),
        );

        return (
          <div key={abschnitt.id} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <h3 className="mr-auto text-sm font-semibold">
                {abschnitt.name}{" "}
                <span className="font-normal text-muted-foreground tabular">
                  · {abschnitt.artikel.length}
                </span>
              </h3>
              {nachzuholen.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onHinzufuegen(nachzuholen.map((a) => a.id))}
                >
                  Gruppe auffüllen (+{nachzuholen.length})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  onBald(
                    abschnitt.artikel.map((a) => a.id),
                    !istBald(abschnitt.artikel[0]),
                  )
                }
              >
                {istBald(abschnitt.artikel[0])
                  ? "Alle ins Sortiment"
                  : "Alle als „Bald“"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onEntfernen(abschnitt.artikel.map((a) => a.id))}
              >
                Gruppe entfernen
              </Button>
            </div>

            <ul className="divide-y divide-border">
              {zeilen.map((a) => {
                const preis = katalogPreis(a, preisart);
                const stelle = abschnitt.artikel.indexOf(a);
                const marken = [
                  fehlt.foto.has(a.id) ? { text: "kein Foto", ernst: true } : null,
                  fehlt.preis.has(a.id) ? { text: "kein Preis", ernst: true } : null,
                  !istBald(a) && a.bestand <= 0 ? { text: "ausverkauft", ernst: false } : null,
                  !a.aktiv ? { text: "ausgeblendet", ernst: false } : null,
                ].filter((m) => m !== null);
                const fehltImKatalog = marken.some((m) => m.ernst);

                return (
                  <li
                    key={a.id}
                    className={`flex items-center gap-2.5 px-3 py-1.5 ${
                      fehltImKatalog ? "bg-destructive/5" : ""
                    }`}
                  >
                    <Vorschaubild url={a.bildUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.name}
                        {a.gruppeName ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            · {a.gruppeName}
                          </span>
                        ) : null}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular">
                        <span>{a.sku}</span>
                        {marken.map((m) => (
                          <span
                            key={m.text}
                            className={m.ernst ? "font-medium text-destructive" : ""}
                          >
                            {m.text}
                          </span>
                        ))}
                      </p>
                    </div>

                    {preisart !== "ohne" ? (
                      <span className="shrink-0 text-right text-sm tabular">
                        {preis ? (
                          <>
                            <span
                              className={
                                preis.reduziert ? "font-medium text-signal" : ""
                              }
                            >
                              {formatPrice(preis.preis)}
                            </span>
                            {preis.reduziert ? (
                              <span className="block text-[11px] text-muted-foreground">
                                −{preis.reduziert.prozent} %
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </span>
                    ) : null}

                    <div className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => onBald([a.id], !istBald(a))}
                        aria-label={
                          istBald(a)
                            ? `${a.name} ins Sortiment holen`
                            : `${a.name} als „Bald im Sortiment“ führen`
                        }
                      >
                        {istBald(a) ? "Ins Sortiment" : "Bald"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={aktiv !== null || stelle === 0}
                        onClick={() => onVerschieben(a.id, -1)}
                        aria-label={`${a.name} nach oben`}
                      >
                        <ChevronUp aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={
                          aktiv !== null ||
                          stelle === abschnitt.artikel.length - 1
                        }
                        onClick={() => onVerschieben(a.id, 1)}
                        aria-label={`${a.name} nach unten`}
                      >
                        <ChevronDown aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEntfernen([a.id])}
                        aria-label={`${a.name} entfernen`}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
