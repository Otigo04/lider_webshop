"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { searchPosProductsAction } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
import { Input } from "@/components/ui/input";
import { formatPrice, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Artikel über die Bezeichnung finden, statt zu scannen.
 *
 * Für alles ohne lesbares Etikett und für den Fall, dass jemand nur weiß, was
 * er sucht („Lego") und nicht, welcher Artikel es genau ist. Gesucht wird über
 * Bezeichnung, Artikelnummer und Barcode; die Trefferliste ist mit den
 * Pfeiltasten bedienbar, damit man an der Kasse die Hand nicht von der
 * Tastatur nehmen muss.
 */

/** Ab so vielen Zeichen wird gesucht. Darunter träfe fast alles zu. */
const MINDESTLAENGE = 2;

/** Wartezeit nach dem letzten Tastendruck, bevor die Suche losläuft. */
const VERZOEGERUNG = 250;

export function PosProductSearch({
  onSelect,
}: {
  onSelect: (product: PosProduct) => void;
}) {
  const [begriff, setBegriff] = useState("");
  const [treffer, setTreffer] = useState<PosProduct[]>([]);
  const [markiert, setMarkiert] = useState(0);
  const [gesucht, setGesucht] = useState(false);
  const [laeuft, startSuche] = useTransition();
  const feldRef = useRef<HTMLInputElement>(null);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nur aufräumen, kein Zustand: ein noch offener Zeitgeber soll nach dem
  // Ausbauen der Komponente nicht mehr feuern.
  useEffect(() => {
    return () => {
      if (zeitgeber.current) clearTimeout(zeitgeber.current);
    };
  }, []);

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
    <div>
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
          role="listbox"
          aria-label="Gefundene Artikel"
          className="mt-2 max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card"
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
                    {product.unitPrice !== null
                      ? formatPrice(product.unitPrice)
                      : "—"}
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
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          Kein Artikel gefunden. Über den Scan eines unbekannten Codes lässt
          sich ein neuer Artikel anlegen.
        </p>
      ) : null}
    </div>
  );
}
