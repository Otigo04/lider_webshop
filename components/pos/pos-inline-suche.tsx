"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { searchPosProductsAction } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
import { Input } from "@/components/ui/input";
import { formatPrice, formatQuantity } from "@/lib/format";
import { counterUnitPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { PosPriceMode } from "@/lib/types";

/**
 * Bezeichnungsfeld einer Neuanlage – mit Artikelabgleich.
 *
 * Nicht jede Lieferung hat eine EAN: die Iden-Rechnung hatte sie, Alpalium
 * nicht. Ohne Barcode landet jeder Scan bei "unbekannt", auch wenn der
 * Artikel längst im Stamm steht – etwa weil er selbst ohne Barcode angelegt
 * wurde. Ohne diesen Abgleich tippt man Name und drei Preise ein zweites Mal
 * und bekommt einen doppelten Artikel, statt dem bestehenden Zugang zu
 * geben.
 *
 * Gleicher Aufbau wie `PreisschildArtikelSuche` und `PosProductSearch`:
 * schwebende Liste, Pfeiltasten, Enter wählt, Escape schließt. Anders als bei
 * `PreisschildArtikelSuche` gibt es hier kein Scannerfeld, das zuerst
 * entscheidet – das Feld existiert nur, nachdem ein Scan oder eine
 * Direkteingabe bereits "unbekannt" ergeben hat, deshalb sucht es immer.
 *
 * Liefert einen vollständigen `PosProduct` zurück: der Aufrufer füllt daraus
 * Bestand, Warengruppe und alle drei Preise – das ist der Teil, der die
 * doppelte Eingabe erspart.
 */

const MINDESTLAENGE = 2;
const VERZOEGERUNG = 250;

export function PosInlineSuche({
  id,
  value,
  onChange,
  onSelect,
  preisModus,
  placeholder,
  className,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Ein Treffer wurde gewählt – der Aufrufer übernimmt ihn. */
  onSelect: (product: PosProduct) => void;
  /** Bestimmt, welcher Preis in der Trefferliste steht. */
  preisModus: PosPriceMode;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [treffer, setTreffer] = useState<PosProduct[]>([]);
  const [markiert, setMarkiert] = useState(0);
  const [laeuft, startSuche] = useTransition();
  const huelleRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (zeitgeber.current) clearTimeout(zeitgeber.current);
    };
  }, []);

  useEffect(() => {
    listeRef.current?.children[markiert]?.scrollIntoView({ block: "nearest" });
  }, [markiert, treffer]);

  /* Klick daneben schließt die Liste; der getippte Text bleibt stehen – er
     ist die Bezeichnung des Artikels, kein bloßes Suchwort. */
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

  function beiEingabe(neu: string) {
    onChange(neu);
    if (zeitgeber.current) clearTimeout(zeitgeber.current);

    const frage = neu.trim();
    if (frage.length < MINDESTLAENGE) {
      setTreffer([]);
      return;
    }

    zeitgeber.current = setTimeout(() => {
      startSuche(async () => {
        const ergebnis = await searchPosProductsAction(frage);
        setTreffer(ergebnis);
        setMarkiert(0);
      });
    }, VERZOEGERUNG);
  }

  function uebernehmen(product: PosProduct) {
    setTreffer([]);
    if (zeitgeber.current) clearTimeout(zeitgeber.current);
    onSelect(product);
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
      event.preventDefault();
      setTreffer([]);
    }
  }

  return (
    <div ref={huelleRef} className="relative">
      <Input
        id={id}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={200}
        placeholder={placeholder ?? "Bezeichnung"}
        onChange={(event) => beiEingabe(event.target.value)}
        onKeyDown={beiTaste}
        role="combobox"
        aria-expanded={treffer.length > 0}
        aria-controls={`${id}-treffer`}
        className={cn("pr-9", className)}
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
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card text-left shadow-lg"
        >
          {treffer.map((product, index) => (
            <li key={product.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === markiert}
                onMouseEnter={() => setMarkiert(index)}
                onClick={() => uebernehmen(product)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  index === markiert ? "bg-brand-soft" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{product.name}</span>
                  <span className="code block text-[11px] text-muted-foreground">
                    {product.sku}
                    {product.barcode ? ` · ${product.barcode}` : " · kein Barcode"}
                    {product.categoryName ? ` · ${product.categoryName}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular">
                    {formatPrice(counterUnitPrice(product, 1, preisModus))}
                  </span>
                  <span className="block text-[11px] text-muted-foreground tabular">
                    {formatQuantity(product.freeStock)} am Lager
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
