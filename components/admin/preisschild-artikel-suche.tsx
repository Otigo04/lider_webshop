"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { sucheSchildArtikelNachName } from "@/lib/actions/preisschilder";
import { formatPrice } from "@/lib/format";
import type { PreisschildArtikel } from "@/lib/queries/preisschilder";
import { cn } from "@/lib/utils";

/**
 * Bezeichnungsfeld des freien Preisschild-Generators – mit Artikelabgleich.
 *
 * Der Scan deckt Ware mit lesbarem Etikett ab. Vieles im Laden hat keines
 * mehr: dann weiß man, wie der Artikel heißt, und sucht ihn. Bezeichnung und
 * drei Preise abzutippen, obwohl sie im Stamm stehen, ist genau die
 * Doppelarbeit, die der Abgleich abschaffen soll.
 *
 * **Nur bei leerem Scannerfeld** (`aktiv`). Steht dort ein Code, hat er
 * entschieden: entweder sind die Angaben schon aus dem Stamm gefüllt – dann
 * wäre eine Trefferliste darüber eine Einladung, einen zweiten Artikel unter
 * dem Code des ersten zu wählen – oder der Code ist unbekannt, und dann wird
 * gerade die Bezeichnung eines neuen Artikels getippt. Ein Vorschlag dort
 * führte zum teuersten Fehler überhaupt: neue Ware unter dem Datensatz einer
 * alten.
 *
 * Aufbau wie `components/pos/pos-product-search.tsx`: schwebende Liste,
 * Pfeiltasten, Enter wählt, Escape schließt. Die Liste schwebt, weil
 * darunter Preisfelder und Vorschau stehen – eingeschoben rutschte beides
 * bei jedem Suchwort weg.
 */

/** Ab so vielen Zeichen wird gesucht. Darunter trifft fast jeder Artikel zu. */
const MINDESTLAENGE = 2;

/** Ruhe nach dem letzten Tastendruck, bevor die Abfrage losläuft. */
const VERZOEGERUNG = 250;

export function PreisschildArtikelSuche({
  id,
  wert,
  onChange,
  onSelect,
  aktiv,
  feldRef,
}: {
  id: string;
  wert: string;
  onChange: (wert: string) => void;
  /** Ein Treffer wurde gewählt – der Aufrufer übernimmt ihn ins Formular. */
  onSelect: (artikel: PreisschildArtikel) => void;
  /** Nur suchen, wenn im Scannerfeld nichts steht. */
  aktiv: boolean;
  feldRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [treffer, setTreffer] = useState<PreisschildArtikel[]>([]);
  const [markiert, setMarkiert] = useState(0);
  const [laeuft, startSuche] = useTransition();
  const huelleRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Ein offener Zeitgeber soll nach dem Ausbauen nicht mehr feuern. */
  useEffect(() => {
    return () => {
      if (zeitgeber.current) clearTimeout(zeitgeber.current);
    };
  }, []);

  /*
   * Sobald ein Code im Scannerfeld landet, ist die Liste hinfällig: die
   * Bezeichnung kommt dann aus dem Stamm oder gehört zu einem neuen Artikel.
   * Eine offen stehende Liste würde über Angaben schweben, die gerade
   * jemand anders gesetzt hat.
   *
   * Geleert wird beim Rendern und nicht in einem Effekt: so steht die Liste
   * keinen Durchlauf lang noch offen. Der Zeitgeber ist ein Ref und darf erst
   * im Effekt angefasst werden.
   */
  const [warAktiv, setWarAktiv] = useState(aktiv);
  if (aktiv !== warAktiv) {
    setWarAktiv(aktiv);
    if (!aktiv) setTreffer([]);
  }

  useEffect(() => {
    if (!aktiv && zeitgeber.current) clearTimeout(zeitgeber.current);
  }, [aktiv]);

  /* Markierung im Blick behalten, sonst blättert man bei zwölf Treffern ins
     Leere. `nearest` scrollt nur so weit wie nötig. */
  useEffect(() => {
    listeRef.current?.children[markiert]?.scrollIntoView({ block: "nearest" });
  }, [markiert, treffer]);

  /* Klick daneben schließt die Liste. Der getippte Text bleibt stehen – er
     ist die Bezeichnung des Schilds und nicht bloß ein Suchwort. */
  useEffect(() => {
    if (treffer.length === 0) return;

    function beiKlick(event: MouseEvent) {
      const ziel = event.target as Node | null;
      if (ziel && huelleRef.current?.contains(ziel)) return;
      setTreffer([]);
    }

    document.addEventListener("mousedown", beiKlick);
    return () => document.removeEventListener("mousedown", beiKlick);
  }, [treffer.length]);

  /**
   * Die Suche hängt am Tastendruck und nicht an einem Effekt: gesucht wird
   * nur, wenn wirklich jemand tippt. Ein Treffer, der die Bezeichnung
   * einsetzt, löste sonst gleich die nächste Suche aus.
   */
  function beiEingabe(neu: string) {
    onChange(neu);
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
    if (!aktiv) return;

    const frage = neu.trim();
    if (frage.length < MINDESTLAENGE) {
      setTreffer([]);
      return;
    }

    zeitgeber.current = setTimeout(() => {
      startSuche(async () => {
        const ergebnis = await sucheSchildArtikelNachName(frage);
        setTreffer(ergebnis);
        setMarkiert(0);
      });
    }, VERZOEGERUNG);
  }

  function uebernehmen(artikel: PreisschildArtikel) {
    setTreffer([]);
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
    onSelect(artikel);
  }

  function beiTaste(event: React.KeyboardEvent<HTMLInputElement>) {
    if (treffer.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMarkiert((index) => (index + 1) % treffer.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMarkiert((index) => (index - 1 + treffer.length) % treffer.length);
    }
    /*
     * Enter wählt den markierten Treffer, statt das Formular abzuschicken:
     * solange die Liste offen steht, ist Enter die Auswahl. Ein Schild, das
     * mit halb getippter Bezeichnung aufs Blatt springt, während darüber die
     * passende Zeile steht, wäre das Gegenteil von hilfreich.
     */
    if (event.key === "Enter") {
      event.preventDefault();
      uebernehmen(treffer[markiert]);
    }
    /* Escape schließt nur die Liste. Das Feld zu leeren hieße, eine gerade
       getippte Bezeichnung zu verwerfen. */
    if (event.key === "Escape") {
      event.preventDefault();
      setTreffer([]);
    }
  }

  return (
    <div ref={huelleRef} className="relative">
      <Input
        id={id}
        ref={feldRef}
        value={wert}
        autoComplete="off"
        onChange={(event) => beiEingabe(event.target.value)}
        onKeyDown={beiTaste}
        placeholder="z. B. Handbesen mit Schaufel"
        maxLength={120}
        role="combobox"
        aria-expanded={treffer.length > 0}
        aria-controls={`${id}-treffer`}
        className="h-9 pr-9"
      />
      {laeuft ? (
        <Loader2
          className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : null}

      {treffer.length > 0 ? (
        <ul
          id={`${id}-treffer`}
          ref={listeRef}
          role="listbox"
          aria-label="Artikel aus dem Bestand"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card shadow-lg"
        >
          {treffer.map((artikel, index) => (
            <li key={artikel.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === markiert}
                onMouseEnter={() => setMarkiert(index)}
                onClick={() => uebernehmen(artikel)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  index === markiert ? "bg-brand-soft" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {artikel.name}
                  </span>
                  <span className="code block text-[11px] text-muted-foreground">
                    {artikel.sku}
                    {artikel.barcode ? ` · ${artikel.barcode}` : " · kein Barcode"}
                    {artikel.kategorie ? ` · ${artikel.kategorie}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {/* Der Schildpreis, nicht der Großhandelspreis: das ist die
                      Zahl, die nach der Auswahl im Formular steht. */}
                  <span className="block font-semibold tabular">
                    {artikel.preis === null ? "kein Preis" : formatPrice(artikel.preis)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground tabular">
                    {artikel.bestand} am Lager
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
