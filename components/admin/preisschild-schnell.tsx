"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/numeric-input";
import {
  PreisschildBogenVorschau,
  type BogenPlatz,
} from "@/components/admin/preisschild-bogen-vorschau";
import {
  formatMass,
  proBogen,
  schildLabel,
  schildPreis,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";

/**
 * Schnellerfassung für Preisschilder: Bezeichnung, Preis, Stück, optional Vorher-Preis.
 *
 * Für Ware, die nicht in den Bestand soll. Kein Scan, kein Artikel, kein
 * Rückschreiben; gedruckt wird über denselben Bogen-Handler wie bei den
 * anderen Generatoren (`/admin/preisschilder/druck`), damit ein Schild von
 * hier im Regal nicht anders aussieht als eins aus dem Bestand.
 *
 * Die Liste endet immer in einer leeren Zeile: wer tippt, hat die nächste
 * schon vor sich. Enter springt von der Bezeichnung in den Preis und vom
 * Preis in die Bezeichnung der nächsten Zeile.
 *
 * Gemerkt wird die Liste im Browser (externer Store, wie der Stapel des
 * freien Generators), nicht in der Datenbank – ein Preisschild ist eine
 * Momentaufnahme.
 */

interface Zeile {
  id: string;
  name: string;
  preis: number;
  /** Streichpreis; 0 = keine Reduzierung. */
  vorher: number;
  anzahl: number;
}

interface Stand {
  zeilen: Zeile[];
  formatId: string | null;
}

const SPEICHER = "lider.preisschilder.schnell.v1";
const MAX_SCHILDER = 1000;

function neueZeile(): Zeile {
  return { id: crypto.randomUUID(), name: "", preis: 0, vorher: 0, anzahl: 1 };
}

function leer(z: Zeile): boolean {
  return z.name.trim() === "" && z.preis === 0 && z.vorher === 0;
}

/**
 * Am Ende steht immer eine leere Zeile. Leere Zeilen in der Mitte bleiben
 * stehen: verschwände eine mitten im Tippen, ginge der Fokus mit ihr.
 */
function mitLeerzeile(zeilen: Zeile[]): Zeile[] {
  const letzte = zeilen[zeilen.length - 1];
  return letzte && leer(letzte) ? zeilen : [...zeilen, neueZeile()];
}

/* ---- Speicher -------------------------------------------------------------- */

const SERVER_STAND: Stand = { zeilen: [], formatId: null };
let stand: Stand = SERVER_STAND;
let gelesen = false;
const hoerer = new Set<() => void>();

function lese(): Stand {
  if (gelesen) return stand;
  gelesen = true;
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? "null");
    if (roh && Array.isArray(roh.zeilen)) {
      const zeilen: Zeile[] = roh.zeilen
        .filter((z: Partial<Zeile>) => typeof z?.id === "string")
        .map((z: Partial<Zeile>) => ({
          id: z.id as string,
          name: String(z.name ?? "").slice(0, 120),
          preis: Math.max(0, Number(z.preis) || 0),
          vorher: Math.max(0, Number(z.vorher) || 0),
          anzahl: Math.min(500, Math.max(1, Math.round(Number(z.anzahl) || 1))),
        }));
      stand = {
        zeilen: mitLeerzeile(zeilen),
        formatId: typeof roh.formatId === "string" ? roh.formatId : null,
      };
      return stand;
    }
  } catch {
    // Speicher gesperrt oder kaputt: mit leerer Liste weiter.
  }
  stand = { zeilen: [neueZeile()], formatId: null };
  return stand;
}

function setze(naechster: Stand) {
  stand = naechster;
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(naechster));
  } catch {
    // Nicht speicherbar: die Liste lebt dann nur bis zum Neuladen.
  }
  hoerer.forEach((h) => h());
}

function abonniere(h: () => void) {
  hoerer.add(h);
  return () => hoerer.delete(h);
}

/* ---- Maske ----------------------------------------------------------------- */

export function PreisschildSchnell({ formate }: { formate: SchildFormat[] }) {
  const aktuell = useSyncExternalStore(abonniere, lese, () => SERVER_STAND);
  const bereit = aktuell !== SERVER_STAND;

  // Mittlere Größe als Vorgabe: die kleine trägt kaum eine Bezeichnung.
  const format =
    formate.find((f) => f.id === aktuell.formatId) ??
    formate[Math.min(1, formate.length - 1)] ??
    formate[0];

  const gueltig = useMemo(
    () => aktuell.zeilen.filter((z) => z.name.trim() && z.preis > 0),
    [aktuell.zeilen],
  );
  const gesamt = gueltig.reduce((s, z) => s + z.anzahl, 0);
  const zuViel = gesamt > MAX_SCHILDER;

  const plaetze = useMemo<BogenPlatz[]>(() => {
    const liste: BogenPlatz[] = [];
    for (const z of gueltig) {
      const { preis, vorher, prozent } = schildPreis(z.preis, z.vorher || null);
      const schild: Preisschild = {
        name: z.name.trim(),
        preis,
        vorher,
        prozent,
        sku: "",
        code: null,
        barcode: null,
        icon: null,
        label: schildLabel(null, vorher),
      };
      for (let i = 0; i < z.anzahl; i++) {
        liste.push({ eintragId: z.id, schild });
      }
    }
    return liste;
  }, [gueltig]);

  function aendere(id: string, teil: Partial<Zeile>) {
    const zeilen = aktuell.zeilen.map((z) => (z.id === id ? { ...z, ...teil } : z));
    setze({ ...aktuell, zeilen: mitLeerzeile(zeilen) });
  }

  function entferne(id: string) {
    setze({ ...aktuell, zeilen: mitLeerzeile(aktuell.zeilen.filter((z) => z.id !== id)) });
  }

  function fokus(feld: string, id: string) {
    document
      .querySelector<HTMLInputElement>(`[data-feld="${feld}-${id}"]`)
      ?.focus();
  }

  const bogenDaten = JSON.stringify({
    format: format
      ? { name: format.name, breite: format.breite, hoehe: format.hoehe }
      : null,
    zeilen: gueltig.map((z) => ({
      name: z.name.trim(),
      sku: "",
      barcode: null,
      preis: z.preis,
      vorher: z.vorher || null,
      gh: null,
      iconId: null,
      label: null,
      anzahl: z.anzahl,
    })),
  });

  if (!bereit) return null;

  return (
    <div className="space-y-6">
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
                  onClick={() => setze({ ...aktuell, formatId: f.id })}
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
                      gewaehlt ? "text-brand-foreground/75" : "text-muted-foreground"
                    }`}
                  >
                    {formatMass(f)} · {proBogen(f)}/Bogen
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular">
            {gesamt} {gesamt === 1 ? "Schild" : "Schilder"}
          </span>
          {gueltig.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setze({ ...aktuell, zeilen: [neueZeile()] })}
            >
              Liste leeren
            </Button>
          ) : null}
          <form
            method="post"
            action="/admin/preisschilder/druck"
            target="_blank"
          >
            <input type="hidden" name="bogen" value={bogenDaten} />
            <Button type="submit" disabled={gesamt === 0 || zuViel || !format}>
              <Printer className="size-4" aria-hidden />
              Drucken
            </Button>
          </form>
        </div>
      </div>

      {zuViel ? (
        <p className="text-sm text-destructive">
          {gesamt} Schilder sind zu viel – höchstens {MAX_SCHILDER} auf einmal.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
        <section aria-label="Schilder">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4rem_2rem] gap-2 px-1 pb-1 text-xs font-medium text-muted-foreground">
            <span>Bezeichnung</span>
            <span>Preis €</span>
            <span title="Durchgestrichener alter Preis – macht das Schild rot">Vorher €</span>
            <span>Stück</span>
            <span />
          </div>
          <ul className="space-y-2">
            {aktuell.zeilen.map((z, index) => (
              <li
                key={z.id}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4rem_2rem] items-center gap-2"
              >
                <Input
                  data-feld={`name-${z.id}`}
                  value={z.name}
                  maxLength={120}
                  placeholder={index === 0 ? "z. B. Kerzenhalter Glas, 12 cm" : ""}
                  autoFocus={index === 0 && aktuell.zeilen.length === 1}
                  autoComplete="off"
                  onChange={(e) => aendere(z.id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      fokus("preis", z.id);
                    }
                  }}
                />
                <NumericInput
                  data-feld={`preis-${z.id}`}
                  dezimal
                  value={z.preis}
                  onChange={(preis) => aendere(z.id, { preis })}
                  onEnter={() => {
                    const naechste = aktuell.zeilen[index + 1];
                    if (naechste) fokus("name", naechste.id);
                  }}
                />
                <NumericInput
                  data-feld={`vorher-${z.id}`}
                  dezimal
                  value={z.vorher}
                  onChange={(vorher) => aendere(z.id, { vorher })}
                  onEnter={() => {
                    const naechste = aktuell.zeilen[index + 1];
                    if (naechste) fokus("name", naechste.id);
                  }}
                />
                <NumericInput
                  data-feld={`anzahl-${z.id}`}
                  value={z.anzahl}
                  onChange={(n) =>
                    aendere(z.id, { anzahl: Math.min(500, Math.max(1, Math.round(n))) })
                  }
                />
                {leer(z) ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    onClick={() => entferne(z.id)}
                    aria-label={`„${z.name || "Zeile"}" entfernen`}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Vorschau">
          {format ? (
            <PreisschildBogenVorschau
              plaetze={plaetze}
              format={format}
              barcodePlatz={false}
              aktiv={null}
              onWaehlen={(id) => fokus("name", id)}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
