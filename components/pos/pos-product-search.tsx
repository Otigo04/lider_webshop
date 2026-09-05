"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { searchPosProductsAction } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
import { Input } from "@/components/ui/input";
import { formatPrice, formatQuantity } from "@/lib/format";
import { counterUnitPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PosPriceMode } from "@/lib/types";

/**
 * Artikel über die Bezeichnung finden, statt zu scannen.
 *
 * Für alles ohne lesbares Etikett und für den Fall, dass jemand nur weiß, was
 * er sucht („Lego") und nicht, welcher Artikel es genau ist. Gesucht wird über
 * Bezeichnung, Artikelnummer und Barcode; die Trefferliste ist mit den
 * Pfeiltasten bedienbar, damit man an der Kasse die Hand nicht von der
 * Tastatur nehmen muss.
 *
 * Die Liste **schwebt** über der Seite, statt zwischen Suchfeld und Bon
 * eingeschoben zu werden. Eine Suche nach einer Marke bringt schnell dutzende
 * Treffer; inline geschoben rutschte der Bon aus dem Bild und man scrollte
 * nach jeder Auswahl zurück. Gescrollt wird nur noch in der Liste selbst –
 * die Pfeiltasten ziehen die Markierung dabei mit.
 */

/** Ab so vielen Zeichen wird gesucht. Darunter träfe fast alles zu. */
const MINDESTLAENGE = 2;

/** Wartezeit nach dem letzten Tastendruck, bevor die Suche losläuft. */
const VERZOEGERUNG = 250;

export function PosProductSearch({
  onSelect,
  preisModus,
}: {
  onSelect: (product: PosProduct) => void;
  /** Bestimmt, welcher Preis in der Trefferliste steht */
  preisModus: PosPriceMode;
}) {
  const [begriff, setBegriff] = useState("");
  const [treffer, setTreffer] = useState<PosProduct[]>([]);
  const [markiert, setMarkiert] = useState(0);
  const [gesucht, setGesucht] = useState(false);
  const [laeuft, startSuche] = useTransition();
  const feldRef = useRef<HTMLInputElement>(null);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);
  const huelleRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);

  // Nur aufräumen, kein Zustand: ein noch offener Zeitgeber soll nach dem
  // Ausbauen der Komponente nicht mehr feuern.
  useEffect(() => {
    return () => {
      if (zeitgeber.current) clearTimeout(zeitgeber.current);
    };
  }, []);

  /*
   * Markierung im Blick behalten. Ohne das läuft sie beim Blättern mit den
   * Pfeiltasten aus dem sichtbaren Bereich – bei fünfzig Treffern tippt man
   * dann ins Leere. `nearest` scrollt nur so weit wie nötig, die Liste
   * springt also nicht bei jedem Schritt.
   */
  useEffect(() => {
    const liste = listeRef.current;
    if (!liste) return;
    liste.children[markiert]?.scrollIntoView({ block: "nearest" });
  }, [markiert, treffer]);

  /*
   * Klick neben die Liste schließt sie. Ein schwebendes Feld, das offen
   * bleibt, während man am Bon arbeitet, verdeckt genau das, was man sehen
   * will. Der Suchbegriff bleibt stehen, damit sich die Liste durch einen
   * Klick ins Feld wieder öffnen lässt.
   */
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
   * Die Suche hängt am Tastendruck, nicht an einem Effekt: so wird nur
   * gesucht, wenn wirklich jemand tippt, und das Leeren der Liste bleibt eine
   * Reaktion auf eine Eingabe statt eine zusätzliche Renderrunde.
   */
  function beiEingabe(wert: string) {
    setBegriff(wert);
    if (zeitgeber.current) clearTimeout(zeitgeber.current);

    const frage = wert.trim();
    if (frage.length < MINDESTLAENGE) {
      setTreffer([]);
      setGesucht(false);
      return;
    }

    // Nicht bei jedem Tastendruck zum Server: erst wenn kurz Ruhe ist.
    zeitgeber.current = setTimeout(() => {
      startSuche(async () => {
        const ergebnis = await searchPosProductsAction(frage);
        setTreffer(ergebnis);
        setMarkiert(0);
        setGesucht(true);
      });
    }, VERZOEGERUNG);
  }

  function uebernehmen(product: PosProduct) {
    onSelect(product);
    setBegriff("");
    setTreffer([]);
    setGesucht(false);
    feldRef.current?.focus();
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
    if (event.key === "Enter") {
      event.preventDefault();
      uebernehmen(treffer[markiert]);
    }
    if (event.key === "Escape") {
      setBegriff("");
      setTreffer([]);
    }
  }

  return (
    <div ref={huelleRef} className="relative">
      <label
        htmlFor="pos-suche"
        className="flex items-center gap-2 text-sm font-medium"
      >
        <Search className="size-4 text-brand" aria-hidden />
        Nach Bezeichnung suchen
      </label>

      <div className="relative mt-2">
        <Input
          id="pos-suche"
          ref={feldRef}
          value={begriff}
          autoComplete="off"
          placeholder="z. B. Lego, Powerbank, Hülle"
          onChange={(event) => beiEingabe(event.target.value)}
          onKeyDown={beiTaste}
          role="combobox"
          aria-expanded={treffer.length > 0}
          aria-controls="pos-treffer"
          className="h-12 px-4 text-base"
        />
        {laeuft ? (
          <Loader2
            className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand"
            aria-hidden
          />
        ) : null}
      </div>

      {treffer.length > 0 ? (
        <ul
          id="pos-treffer"
          ref={listeRef}
          role="listbox"
          aria-label="Gefundene Artikel"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card shadow-lg"
        >
          {treffer.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === markiert}
                onMouseEnter={() => setMarkiert(index)}
                onClick={() => uebernehmen(product)}
                disabled={product.freeStock <= 0}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  index === markiert ? "bg-brand-soft" : "hover:bg-muted",
                  product.freeStock <= 0 && "opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {product.name}
                  </span>
                  <span className="code block text-xs text-muted-foreground">
                    {product.sku}
                    {product.barcode ? ` · ${product.barcode}` : ""}
                    {product.categoryName ? ` · ${product.categoryName}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular">
                    {formatPrice(counterUnitPrice(product, 1, preisModus))}
                  </span>
                  <span
                    className={cn(
                      "block text-xs tabular",
                      product.freeStock <= 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {product.freeStock <= 0
                      ? "ausverkauft"
                      : `${formatQuantity(product.freeStock)} verfügbar`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {gesucht && !laeuft && treffer.length === 0 ? (
        <p className="absolute inset-x-0 top-full z-30 mt-2 rounded-md border border-border bg-card px-3 py-3 text-sm text-muted-foreground shadow-lg">
          Kein Artikel gefunden. Über den Scan eines unbekannten Codes lässt
          sich ein neuer Artikel anlegen.
        </p>
      ) : null}
    </div>
  );
}
