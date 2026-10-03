"use client";

import { useState, useTransition } from "react";
import { ClipboardPaste, Loader2, TriangleAlert } from "lucide-react";
import { lookupPosProducts } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, formatQuantity } from "@/lib/format";
import {
  fasseZusammen,
  parseImport,
  type ImportErgebnis,
  type ImportZeile,
} from "@/lib/wareneingang-import";
import type { Category } from "@/lib/types";

/**
 * Sammelimport – eine ganze Lieferliste auf einmal in die Aufnahme.
 *
 * Der Scanner ist unschlagbar, solange die Ware vor einem steht. Kommt die
 * Lieferung aber mit einer Rechnung oder einer Preisliste des Lieferanten,
 * stehen Barcode, Bezeichnung, Menge und Preise dort bereits – und hundert
 * Positionen in sechs Felder je Artikel zu tippen ist eine halbe Schicht, bei
 * der jede Ziffer ein Zahlendreher werden kann.
 *
 * Der Dialog schreibt nichts. Er füllt die Aufnahmeliste, und gebucht wird
 * danach wie immer über dieselbe Sammelbuchung. Ein zweiter Buchungsweg liefe
 * über kurz oder lang neben dem ersten her.
 *
 * Vor dem Übernehmen wird abgeglichen: bekannte Barcodes kommen mit ihren
 * Stammdaten und ihrem Bestand, unbekannte als Neuanlage. Dieselbe
 * Unterscheidung wie beim Scannen, nur für alle Zeilen in einer Abfrage statt
 * in hundert.
 */

export interface ImportTreffer {
  zeile: ImportZeile;
  /** null = unbekannter Code, wird als Neuanlage übernommen */
  produkt: PosProduct | null;
}

export function WareneingangImport({
  open,
  onOpenChange,
  onUebernehmen,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Übergibt die geprüften Zeilen an die Aufnahme – gebucht wird dort */
  onUebernehmen: (treffer: ImportTreffer[]) => void;
  /** Nur für den Hinweis, in welche Warengruppe Neuanlagen fallen */
  categories: Category[];
}) {
  const [text, setText] = useState("");
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [treffer, setTreffer] = useState<ImportTreffer[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pruefend, startPruefen] = useTransition();

  function zuruecksetzen() {
    setText("");
    setErgebnis(null);
    setTreffer(null);
    setFehler(null);
  }

  /**
   * Zerlegen und abgleichen in einem Schritt.
   *
   * Erst die Vorschau, dann das Übernehmen: eine Liste, die ungeprüft in die
   * Aufnahme fällt, müsste dort Zeile für Zeile nachkontrolliert werden – und
   * genau das soll der Import ja abnehmen.
   */
  function pruefen() {
    const gelesen = parseImport(text);
    const zeilen = fasseZusammen(gelesen.zeilen);
    setErgebnis({ zeilen, fehler: gelesen.fehler });
    setTreffer(null);
    setFehler(null);

    if (zeilen.length === 0) return;

    startPruefen(async () => {
      try {
        const codes = zeilen
          .map((zeile) => zeile.barcode)
          .filter((code): code is string => Boolean(code));
        const gefunden = codes.length > 0 ? await lookupPosProducts(codes) : {};

        setTreffer(
          zeilen.map((zeile) => ({
            zeile,
            produkt: zeile.barcode ? (gefunden[zeile.barcode] ?? null) : null,
          })),
        );
      } catch (ursache) {
        console.error("[wareneingang] Import abgleichen:", ursache);
        setFehler("Die Artikel konnten nicht abgeglichen werden.");
      }
    });
  }

  function uebernehmen() {
    if (!treffer) return;
    onUebernehmen(treffer);
    zuruecksetzen();
    onOpenChange(false);
  }

  const bekannt = treffer?.filter((eintrag) => eintrag.produkt !== null).length ?? 0;
  const neu = (treffer?.length ?? 0) - bekannt;
  const stueck =
    treffer?.reduce((summe, eintrag) => summe + eintrag.zeile.menge, 0) ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(offen) => {
        if (!offen) zuruecksetzen();
        onOpenChange(offen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lieferliste einfügen</DialogTitle>
          <DialogDescription>
            Eine Zeile je Position, Felder durch Tabulator oder Semikolon
            getrennt. Aus einer Tabellenkalkulation kopierte Zellen passen
            direkt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="code rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Barcode ; Bezeichnung ; Menge ; GH € ; EH € ; EK €
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Pflicht ist die Menge und entweder Barcode oder Bezeichnung. Leere
              Preisfelder lassen den bisherigen Preis stehen – wie beim Scannen.
              Ein bekannter Barcode bucht einen Zugang, ein unbekannter legt den
              Artikel an
              {categories[0] ? (
                <>
                  {" "}
                  (Warengruppe lässt sich in der Aufnahme je Zeile ändern)
                </>
              ) : null}
              .
            </p>
          </div>

          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={
              "5702017161884;LEGO CITY Polizeiauto;4;8.39;9.99;5.54\n5702017582931;LEGO CITY Feuerwehrhubschrauber;4;8.39;9.99;5.54"
            }
            className="code text-xs"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={pruefen} disabled={pruefend}>
              {pruefend ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ClipboardPaste className="size-4" aria-hidden />
              )}
              Liste prüfen
            </Button>
            {text ? (
              <Button type="button" variant="ghost" onClick={zuruecksetzen}>
                Leeren
              </Button>
            ) : null}
          </div>

          {fehler ? (
            <p className="rounded-md border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal">
              {fehler}
            </p>
          ) : null}

          {/* Nicht lesbare Zeilen stehen oben und nicht in einer Fußnote: eine
              Lieferung, bei der drei von hundert Positionen lautlos fehlen,
              fällt erst beim Zählen im Regal auf. */}
          {ergebnis && ergebnis.fehler.length > 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <TriangleAlert className="size-4" aria-hidden />
                {formatQuantity(ergebnis.fehler.length)}{" "}
                {ergebnis.fehler.length === 1 ? "Zeile" : "Zeilen"} nicht
                übernommen
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {ergebnis.fehler.slice(0, 12).map((eintrag) => (
                  <li key={eintrag.nr}>
                    <span className="tabular">Zeile {eintrag.nr}</span> ·{" "}
                    {eintrag.grund} ·{" "}
                    <span className="code">{eintrag.text.slice(0, 60)}</span>
                  </li>
                ))}
                {ergebnis.fehler.length > 12 ? (
                  <li>… und {formatQuantity(ergebnis.fehler.length - 12)} weitere</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {ergebnis && ergebnis.zeilen.length === 0 && !pruefend ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Keine lesbare Zeile gefunden.
            </p>
          ) : null}

          {treffer && treffer.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2 text-sm">
                <span className="font-medium">Vorschau</span>
                <span className="tabular text-muted-foreground">
                  {formatQuantity(treffer.length)}{" "}
                  {treffer.length === 1 ? "Position" : "Positionen"} ·{" "}
                  {formatQuantity(stueck)} Stück · {formatQuantity(bekannt)}{" "}
                  bekannt · {formatQuantity(neu)} neu
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-1.5 font-medium">Artikel</th>
                      <th className="px-2 py-1.5 text-right font-medium">Menge</th>
                      <th className="px-2 py-1.5 text-right font-medium">GH</th>
                      <th className="px-2 py-1.5 text-right font-medium">EH</th>
                      <th className="px-2 py-1.5 text-right font-medium">EK</th>
                      <th className="px-3 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treffer.map((eintrag) => (
                      <tr
                        key={`${eintrag.zeile.nr}-${eintrag.zeile.barcode ?? eintrag.zeile.name}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-1.5">
                          <span className="font-medium">
                            {eintrag.produkt?.name || eintrag.zeile.name || "—"}
                          </span>
                          {eintrag.zeile.barcode ? (
                            <span className="code block text-muted-foreground">
                              {eintrag.zeile.barcode}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular font-semibold">
                          {eintrag.zeile.menge > 0 ? "+" : ""}
                          {formatQuantity(eintrag.zeile.menge)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular">
                          {eintrag.zeile.ghPreis
                            ? formatPrice(eintrag.zeile.ghPreis)
                            : "–"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular">
                          {eintrag.zeile.ehPreis
                            ? formatPrice(eintrag.zeile.ehPreis)
                            : "–"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular">
                          {eintrag.zeile.ekPreis
                            ? formatPrice(eintrag.zeile.ekPreis)
                            : "–"}
                        </td>
                        <td className="px-3 py-1.5">
                          {eintrag.produkt ? (
                            <span className="text-muted-foreground">
                              Zugang · Bestand{" "}
                              {formatQuantity(eintrag.produkt.freeStock)} →{" "}
                              <span className="font-medium text-foreground">
                                {formatQuantity(
                                  eintrag.produkt.freeStock + eintrag.zeile.menge,
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className="text-gold">wird angelegt</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        {/* Eigene Fußzeile statt DialogFooter: die Kennzahl gehört neben den
            Knopf, nicht in eine zweite Zeile darüber. */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="button" onClick={uebernehmen} disabled={!treffer || treffer.length === 0}>
            In die Aufnahme übernehmen
            {treffer && treffer.length > 0
              ? ` (${formatQuantity(treffer.length)})`
              : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
