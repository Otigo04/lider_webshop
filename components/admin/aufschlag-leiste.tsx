"use client";

import { useEffect, useState, useTransition } from "react";
import { Percent, X } from "lucide-react";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import {
  aufschlagAnwenden,
  type AufschlagErgebnis,
} from "@/lib/actions/admin-products";
import {
  AUFSCHLAG_STANDARD,
  RUNDUNGEN,
  RUNDUNG_LABELS,
  type Rundung,
} from "@/lib/aufschlag";
import { formatPrice } from "@/lib/format";

const WAHL = "input[data-artikel-wahl]";
const ALLE = "input[data-artikel-alle]";

function gewaehlt(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`${WAHL}:checked`),
  ).map((box) => box.value);
}

/**
 * Leiste unten in der Artikelliste: Artikel per Häkchen auswählen, Aufschlag
 * auf den Einkaufspreis festlegen, Vorschau ansehen, übernehmen.
 *
 * Die Häkchen liegen als schlichte Checkboxen in der (serverseitig gerenderten)
 * Tabelle; die Leiste liest sie aus dem Dokument. So bleibt die Liste eine
 * Server Component – dasselbe Muster wie `ArtikelListeMerker`.
 *
 * Gerechnet wird ausschließlich auf dem Server (`aufschlagAnwenden`): die
 * Vorschau zeigt, was beim Übernehmen geschrieben wird, aus derselben Funktion.
 */
export function AufschlagLeiste() {
  const [anzahl, setAnzahl] = useState(0);
  const [prozent, setProzent] = useState<number>(AUFSCHLAG_STANDARD.prozent);
  const [mindest, setMindest] = useState<number>(AUFSCHLAG_STANDARD.mindestEuro);
  const [rundung, setRundung] = useState<Rundung>(AUFSCHLAG_STANDARD.rundung);
  const [vorschau, setVorschau] = useState<AufschlagErgebnis | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  useEffect(() => {
    function beiAenderung(event: Event) {
      const ziel = event.target;
      if (!(ziel instanceof HTMLInputElement)) return;

      if (ziel.matches(ALLE)) {
        document
          .querySelectorAll<HTMLInputElement>(WAHL)
          .forEach((box) => (box.checked = ziel.checked));
      } else if (!ziel.matches(WAHL)) {
        return;
      }

      const gesamt = document.querySelectorAll(WAHL).length;
      const aktiv = gewaehlt().length;
      const alle = document.querySelector<HTMLInputElement>(ALLE);
      if (alle) {
        alle.checked = gesamt > 0 && aktiv === gesamt;
        alle.indeterminate = aktiv > 0 && aktiv < gesamt;
      }
      setAnzahl(aktiv);
      // Eine geänderte Auswahl macht die gezeigte Vorschau ungültig.
      setVorschau(null);
      setMeldung(null);
    }

    document.addEventListener("change", beiAenderung);
    return () => document.removeEventListener("change", beiAenderung);
  }, []);

  function parameter(uebernehmen: boolean) {
    return {
      ids: gewaehlt(),
      prozent,
      mindestEuro: mindest,
      rundung,
      uebernehmen,
    };
  }

  function zeigeVorschau() {
    setMeldung(null);
    starte(async () => {
      const ergebnis = await aufschlagAnwenden(parameter(false));
      if (ergebnis.error) setMeldung(ergebnis.error);
      setVorschau(ergebnis.error ? null : ergebnis);
    });
  }

  function uebernehmen() {
    starte(async () => {
      const ergebnis = await aufschlagAnwenden(parameter(true));
      if (ergebnis.error) {
        setMeldung(ergebnis.error);
        return;
      }
      setVorschau(null);
      setMeldung(
        `${ergebnis.geschrieben ?? 0} Preise geändert` +
          (ergebnis.fehlgeschlagen
            ? `, ${ergebnis.fehlgeschlagen} fehlgeschlagen`
            : "") +
          ".",
      );
      document
        .querySelectorAll<HTMLInputElement>(`${WAHL}, ${ALLE}`)
        .forEach((box) => {
          box.checked = false;
          box.indeterminate = false;
        });
      setAnzahl(0);
    });
  }

  if (anzahl === 0 && !meldung) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-brand bg-card shadow-lg">
      {vorschau?.zeilen ? (
        <div className="mx-auto max-h-72 max-w-7xl overflow-y-auto border-b border-border px-4 py-3">
          {vorschau.zeilen.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bei keinem der gewählten Artikel würde sich der Preis ändern.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Artikel</th>
                  <th className="py-1 pr-3 text-right font-medium">EK</th>
                  <th className="py-1 pr-3 text-right font-medium">GH alt</th>
                  <th className="py-1 pr-3 text-right font-medium">GH neu</th>
                  <th className="py-1 text-right font-medium">Aufschlag</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.zeilen.map((z) => (
                  <tr key={z.id} className="border-b border-border/60 last:border-0">
                    <td className="py-1 pr-3">
                      {z.name}
                      {z.staffeln > 1 ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          nur Grundstaffel
                        </span>
                      ) : null}
                    </td>
                    <td className="tabular py-1 pr-3 text-right text-gold">
                      {formatPrice(z.ek)}
                    </td>
                    <td className="tabular py-1 pr-3 text-right text-muted-foreground">
                      {formatPrice(z.alt)}
                    </td>
                    <td
                      className={`tabular py-1 pr-3 text-right font-medium ${
                        z.neu > z.alt ? "text-signal" : ""
                      }`}
                    >
                      {formatPrice(z.neu)}
                    </td>
                    <td className="tabular py-1 text-right">
                      +{formatPrice(z.neu - z.ek)} ·{" "}
                      {Math.round((z.neu / z.ek - 1) * 100)} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {vorschau.uebersprungen && vorschau.uebersprungen.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Unverändert ({vorschau.uebersprungen.length}):{" "}
              {vorschau.uebersprungen
                .slice(0, 8)
                .map((u) => `${u.name} (${u.grund})`)
                .join(", ")}
              {vorschau.uebersprungen.length > 8 ? ", …" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-x-4 gap-y-2 px-4 py-3">
        {anzahl > 0 ? (
          <>
            <p className="tabular pb-2 text-sm font-medium">
              {anzahl} gewählt
            </p>

            <label className="text-xs text-muted-foreground">
              Aufschlag auf EK (%)
              <NumericInput
                dezimal
                value={prozent}
                onChange={(wert) => {
                  setProzent(wert);
                  setVorschau(null);
                }}
                className="mt-1 w-24 text-right text-foreground"
                aria-label="Aufschlag in Prozent"
              />
            </label>

            <label className="text-xs text-muted-foreground">
              mindestens (€)
              <NumericInput
                dezimal
                value={mindest}
                onChange={(wert) => {
                  setMindest(wert);
                  setVorschau(null);
                }}
                className="mt-1 w-24 text-right text-foreground"
                aria-label="Mindestaufschlag in Euro"
              />
            </label>

            <label className="text-xs text-muted-foreground">
              Runden
              <select
                value={rundung}
                onChange={(event) => {
                  setRundung(event.target.value as Rundung);
                  setVorschau(null);
                }}
                className="mt-1 block h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              >
                {RUNDUNGEN.map((wert) => (
                  <option key={wert} value={wert}>
                    {RUNDUNG_LABELS[wert]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={zeigeVorschau}
                disabled={laeuft}
              >
                <Percent className="size-4" aria-hidden /> Vorschau
              </Button>
              <Button
                type="button"
                onClick={uebernehmen}
                disabled={laeuft || !vorschau?.zeilen?.length}
                title={
                  vorschau?.zeilen?.length
                    ? undefined
                    : "Erst die Vorschau ansehen"
                }
              >
                {vorschau?.zeilen?.length
                  ? `${vorschau.zeilen.length} Preise übernehmen`
                  : "Übernehmen"}
              </Button>
            </div>
          </>
        ) : null}

        {meldung ? (
          <p role="status" className="pb-2 text-sm text-muted-foreground">
            {meldung}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            document
              .querySelectorAll<HTMLInputElement>(`${WAHL}, ${ALLE}`)
              .forEach((box) => {
                box.checked = false;
                box.indeterminate = false;
              });
            setAnzahl(0);
            setVorschau(null);
            setMeldung(null);
          }}
          className="ml-auto pb-2 text-muted-foreground hover:text-foreground"
          title="Auswahl aufheben"
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Auswahl aufheben</span>
        </button>
      </div>
    </div>
  );
}
