"use client";

import { useMemo, useState } from "react";
import { ListPlus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NumericInput } from "@/components/numeric-input";
import { PreisschildGroessen } from "@/components/admin/preisschild-groessen";
import { PreisschildLabels } from "@/components/admin/preisschild-labels";
import { PreisschildSymbole } from "@/components/admin/preisschild-symbole";
import { PreisschildVorschau } from "@/components/admin/preisschild-vorschau";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import {
  formatMass,
  ghCode,
  proBogen,
  schildPreis,
  type LabelOption,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";
import type { LabelIcon, PreisschildArtikel } from "@/lib/queries/preisschilder";

/**
 * Werkbank des Preisschild-Generators.
 *
 * Alles in einer Hand: links die Artikel suchen und anklicken, rechts die
 * Liste bearbeiten, darüber die Vorschau in Originalgröße, dann drucken. Ein
 * Dialog je Artikel oder ein zweiter Schritt „jetzt Bogen zusammenstellen"
 * wäre für die häufigste Aufgabe – dreißig Schilder nach einer Preisrunde –
 * dreißigmal derselbe Umweg.
 *
 * Gefiltert und gerechnet wird im Browser: die Artikelliste kommt einmal
 * vollständig vom Server. Ein Suchlauf je Tastendruck über PostgREST wäre
 * langsamer als das Tippen.
 */

/** Eine Zeile der Schilderliste – ein Artikel, beliebig oft gedruckt. */
interface Zeile {
  productId: string;
  sku: string;
  name: string;
  preis: number;
  /** 0 = keine Reduzierung. Das Feld bleibt leerbar, siehe NumericInput. */
  vorher: number;
  /** Großhandelspreis in Euro; 0 = kein Code hinter der Artikelnummer. */
  gh: number;
  iconId: string | null;
  /** Schlüssel des Labels in der Fußzeile, null = keins */
  labelKey: string | null;
  anzahl: number;
}

/** Wie viele Treffer die Auswahlliste zeigt, bevor sie zur Bleiwüste wird. */
const MAX_TREFFER = 60;

export function PreisschildWerkbank({
  artikel,
  icons,
  formate,
  labels,
}: {
  artikel: PreisschildArtikel[];
  icons: LabelIcon[];
  formate: SchildFormat[];
  labels: LabelOption[];
}) {
  // Eigene Kopie, damit eine neu gewählte Farbe sofort in der Vorschau steht
  // und nicht erst nach dem Speichern.
  const [labelListe, setLabelListe] = useState(labels);
  const [formatId, setFormatId] = useState(
    () => formate[Math.min(1, formate.length - 1)]?.id ?? "",
  );
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [aktiv, setAktiv] = useState<string | null>(null);

  // Eine gerade gelöschte Größe darf die Seite nicht leer lassen.
  const format = formate.find((f) => f.id === formatId) ?? formate[0];

  const kategorien = useMemo(
    () =>
      [...new Set(artikel.map((a) => a.kategorie).filter((k): k is string => !!k))].sort(
        (a, b) => a.localeCompare(b, "de"),
      ),
    [artikel],
  );

  const treffer = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    return artikel.filter((a) => {
      if (kategorie && a.kategorie !== kategorie) return false;
      if (!begriff) return true;
      return (
        a.name.toLowerCase().includes(begriff) ||
        a.sku.toLowerCase().includes(begriff)
      );
    });
  }, [artikel, suche, kategorie]);

  const gesamt = zeilen.reduce((summe, z) => summe + z.anzahl, 0);
  // Artikel ohne gepflegten Preis: ein Schild mit 0,00 € ist Ausschuss, und
  // das fiele erst nach dem Schneiden auf.
  const ohnePreis = zeilen.filter((z) => z.preis <= 0).length;
  const kapazitaet = format ? proBogen(format) : 0;
  const boegen = kapazitaet > 0 ? Math.ceil(gesamt / kapazitaet) : 0;
  const frei = boegen * kapazitaet - gesamt;

  /**
   * Derselbe Artikel ein zweites Mal angeklickt heißt „noch eins", nicht
   * „noch eine Zeile" – wie beim Wareneingang. Zwei Zeilen für denselben
   * Artikel ließen sich getrennt bepreisen und wären damit ein Fehler, der
   * erst auf dem Papier auffällt.
   */
  function hinzufuegen(a: PreisschildArtikel) {
    setAktiv(a.id);
    setZeilen((alt) => {
      const vorhanden = alt.find((z) => z.productId === a.id);
      if (vorhanden) {
        return alt.map((z) =>
          z.productId === a.id ? { ...z, anzahl: z.anzahl + 1 } : z,
        );
      }
      return [
        ...alt,
        {
          productId: a.id,
          sku: a.sku,
          name: a.name,
          preis: a.preis ?? 0,
          vorher: a.vorher ?? 0,
          gh: a.grosshandel ?? 0,
          iconId: null,
          labelKey: null,
          anzahl: 1,
        },
      ];
    });
  }

  function alleHinzufuegen() {
    if (treffer.length === 0) return;
    for (const a of treffer.slice(0, MAX_TREFFER)) hinzufuegen(a);
    toast.success(`${Math.min(treffer.length, MAX_TREFFER)} Artikel übernommen.`);
  }

  function aendern(id: string, feld: Partial<Zeile>) {
    setAktiv(id);
    setZeilen((alt) => alt.map((z) => (z.productId === id ? { ...z, ...feld } : z)));
  }

  function entfernen(id: string) {
    setZeilen((alt) => alt.filter((z) => z.productId !== id));
  }

  /** Aus einer Zeile wird ein Schild – dieselben Regeln wie im Druckbogen. */
  function alsSchild(z: Zeile): Preisschild {
    const { preis, vorher, prozent } = schildPreis(z.preis, z.vorher || null);
    const icon = z.iconId ? icons.find((i) => i.id === z.iconId) : null;
    const label = z.labelKey ? labelListe.find((l) => l.key === z.labelKey) : null;
    return {
      name: z.name,
      preis,
      vorher,
      prozent,
      sku: z.sku,
      code: ghCode(z.gh),
      icon: icon?.url ?? null,
      label: label ? { name: label.name, farbe: label.farbe } : null,
    };
  }

  const vorschauZeile = zeilen.find((z) => z.productId === aktiv) ?? zeilen[0] ?? null;

  // Maße gehen mit, nicht die Kennung der Größe: der geöffnete Bogen soll
  // auch dann noch stimmen, wenn die Größe inzwischen geändert wurde.
  const bogenDaten = JSON.stringify({
    format: format
      ? { name: format.name, breite: format.breite, hoehe: format.hoehe }
      : null,
    zeilen: zeilen.map((z) => ({
      name: z.name,
      sku: z.sku,
      preis: z.preis,
      vorher: z.vorher || null,
      gh: z.gh || null,
      iconId: z.iconId,
      label: alsSchild(z).label,
      anzahl: z.anzahl,
    })),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <PreisschildGroessen formate={formate} />
        <PreisschildSymbole icons={icons} />
        <PreisschildLabels
          labels={labelListe}
          onFarbe={(key, farbe) =>
            setLabelListe((alt) =>
              alt.map((l) => (l.key === key ? { ...l, farbe } : l)),
            )
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ---- Artikel auswählen -------------------------------------- */}
        <aside className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={suche}
              onChange={(event) => setSuche(event.target.value)}
              placeholder="Bezeichnung, Artikelnummer, Barcode"
              aria-label="Artikel suchen"
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={kategorie}
              onChange={(event) => setKategorie(event.target.value)}
              aria-label="Warengruppe"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Alle Warengruppen</option>
              {kategorien.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={alleHinzufuegen}
              disabled={treffer.length === 0}
              title="Alle angezeigten Treffer auf die Liste setzen"
            >
              <ListPlus className="size-4" aria-hidden />
              Alle
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {treffer.length} Artikel
            {treffer.length > MAX_TREFFER
              ? ` – die ersten ${MAX_TREFFER} angezeigt`
              : ""}
          </p>

          <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {treffer.slice(0, MAX_TREFFER).map((a) => {
              const drin = zeilen.find((z) => z.productId === a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => hinzufuegen(a)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {a.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground tabular">
                        {a.sku}
                        {a.preis !== null
                          ? ` · ${formatPrice(a.preis)}`
                          : " · kein Preis"}
                      </span>
                    </span>
                    {drin ? (
                      <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground tabular">
                        {drin.anzahl}
                      </span>
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
        </aside>

        {/* ---- Bogen zusammenstellen ---------------------------------- */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                Schildgröße
              </span>
              <div className="flex flex-wrap gap-1">
                {formate.map((f) => {
                  const gewaehlt = f.id === format?.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormatId(f.id)}
                      aria-pressed={gewaehlt}
                      className={`rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                        gewaehlt
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className="block font-medium">{f.name}</span>
                      <span
                        className={`block text-[11px] tabular ${
                          gewaehlt
                            ? "text-brand-foreground/75"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatMass(f)} · {proBogen(f)}/Bogen
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-sm">
              <p className="font-medium tabular">
                {gesamt} {gesamt === 1 ? "Schild" : "Schilder"} · {boegen}{" "}
                {boegen === 1 ? "Bogen" : "Bögen"}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                {gesamt === 0
                  ? `${kapazitaet} Plätze je A4-Bogen`
                  : frei === 0
                    ? "Bogen voll"
                    : `${frei} ${frei === 1 ? "Platz" : "Plätze"} auf dem letzten Bogen frei`}
              </p>
              {ohnePreis > 0 ? (
                <p className="text-xs font-medium text-destructive">
                  {ohnePreis}{" "}
                  {ohnePreis === 1 ? "Artikel hat" : "Artikel haben"} keinen
                  Preis
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              {zeilen.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setZeilen([])}
                >
                  Liste leeren
                </Button>
              ) : null}
              <form
                method="post"
                action="/admin/preisschilder/druck"
                // Eigenes Fenster: der Bogen öffnet den Druckdialog sofort, und
                // die zusammengestellte Liste soll dahinter stehen bleiben.
                target="_blank"
              >
                <input type="hidden" name="bogen" value={bogenDaten} />
                <Button type="submit" disabled={gesamt === 0 || !format}>
                  <Printer className="size-4" aria-hidden />
                  Druckbogen öffnen
                </Button>
              </form>
            </div>
          </div>

          {vorschauZeile && format ? (
            <div className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-muted/40 p-4">
              <PreisschildVorschau
                schild={alsSchild(vorschauZeile)}
                format={format}
              />
              <div className="max-w-sm space-y-2 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground tabular">
                  {format.name} · {formatMass(format)}
                </p>
                <p className="tabular">
                  {proBogen(format)} Schilder je A4-Bogen. Vorschau in
                  Originalgröße – ein Lineal an den Bildschirm gehalten zeigt
                  dasselbe Maß wie das ausgeschnittene Schild.
                </p>
                <p>
                  Ein Artikel mit gepflegtem Vorher-Preis wird automatisch zum
                  roten Aktionsschild; der Streichpreis muss dafür über dem
                  Verkaufspreis liegen.
                </p>
                <p>
                  Hinter der Artikelnummer steht der Großhandelspreis in Cent,
                  immer mindestens dreistellig: aus 12,99 € wird{" "}
                  <span className="tabular">#1299</span>, aus 0,77 €{" "}
                  <span className="tabular">#077</span>. Feld leeren heißt:
                  kein Code auf dem Schild.
                </p>
              </div>
            </div>
          ) : null}

          {zeilen.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Links einen Artikel anklicken. Ein zweiter Klick auf denselben
              Artikel erhöht die Stückzahl.
            </p>
          ) : (
            <ul className="space-y-3">
              {zeilen.map((z) => (
                <li
                  key={z.productId}
                  onFocus={() => setAktiv(z.productId)}
                  className={`rounded-lg border p-3 transition-colors ${
                    z.preis <= 0
                      ? "border-destructive"
                      : aktiv === z.productId
                        ? "border-brand"
                        : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label
                        className="block text-[11px] font-medium text-muted-foreground"
                        htmlFor={`name-${z.productId}`}
                      >
                        Bezeichnung auf dem Schild
                      </label>
                      <Input
                        id={`name-${z.productId}`}
                        value={z.name}
                        onChange={(event) =>
                          aendern(z.productId, { name: event.target.value })
                        }
                        className="h-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-5 text-muted-foreground hover:text-destructive"
                      onClick={() => entfernen(z.productId)}
                      aria-label={`„${z.name}" von der Liste nehmen`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                    <Feld label="Preis" htmlFor={`preis-${z.productId}`}>
                      <NumericInput
                        id={`preis-${z.productId}`}
                        dezimal
                        value={z.preis}
                        onChange={(wert) => aendern(z.productId, { preis: wert })}
                        className="h-9"
                      />
                    </Feld>

                    <Feld
                      label="Vorher (Streichpreis)"
                      htmlFor={`vorher-${z.productId}`}
                    >
                      <NumericInput
                        id={`vorher-${z.productId}`}
                        dezimal
                        value={z.vorher}
                        onChange={(wert) => aendern(z.productId, { vorher: wert })}
                        className="h-9"
                      />
                    </Feld>

                    <Feld label="Großhandel (verdeckt)" htmlFor={`gh-${z.productId}`}>
                      <NumericInput
                        id={`gh-${z.productId}`}
                        dezimal
                        value={z.gh}
                        onChange={(wert) => aendern(z.productId, { gh: wert })}
                        className="h-9"
                      />
                    </Feld>

                    <Feld label="Symbol" htmlFor={`icon-${z.productId}`}>
                      <select
                        id={`icon-${z.productId}`}
                        value={z.iconId ?? ""}
                        onChange={(event) =>
                          aendern(z.productId, {
                            iconId: event.target.value || null,
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">Ohne</option>
                        {icons.map((icon) => (
                          <option key={icon.id} value={icon.id}>
                            {icon.name}
                          </option>
                        ))}
                      </select>
                    </Feld>

                    <Feld label="Label" htmlFor={`label-${z.productId}`}>
                      <select
                        id={`label-${z.productId}`}
                        value={z.labelKey ?? ""}
                        onChange={(event) =>
                          aendern(z.productId, {
                            labelKey: event.target.value || null,
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      >
                        <option value="">Ohne</option>
                        {labelListe.map((label) => (
                          <option key={label.key} value={label.key}>
                            {label.name}
                          </option>
                        ))}
                      </select>
                    </Feld>

                    <Feld label="Stückzahl" htmlFor={`anzahl-${z.productId}`}>
                      <div className="flex gap-1">
                        <NumericInput
                          id={`anzahl-${z.productId}`}
                          value={z.anzahl}
                          onChange={(wert) =>
                            aendern(z.productId, { anzahl: Math.max(1, wert) })
                          }
                          className="h-9"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0 px-2 text-xs"
                          onClick={() => aendern(z.productId, { anzahl: kapazitaet })}
                          title="Stückzahl auf einen vollen Bogen setzen"
                        >
                          Bogen
                        </Button>
                      </div>
                    </Feld>
                  </div>

                  <p className="mt-2 text-xs tabular">
                    <span className="text-muted-foreground">
                      {z.sku}
                      {ghCode(z.gh) ? `#${ghCode(z.gh)}` : ""}
                    </span>
                    {z.preis <= 0 ? (
                      <span className="ml-2 font-medium text-destructive">
                        Kein Preis gepflegt – das Schild bliebe bei 0,00 €.
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Beschriftetes Feld. Die Labels stehen an jeder Zeile, nicht als
 *  Tabellenkopf: auf dem Telefon stapeln sich die Felder untereinander, und
 *  ein Kopf ganz oben wäre dann drei Bildschirme entfernt. */
function Feld({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        className="block text-[11px] font-medium text-muted-foreground"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
