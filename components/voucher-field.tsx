"use client";

import { useState, useTransition } from "react";
import { Loader2, Ticket, X } from "lucide-react";
import { pruefeGutschein } from "@/lib/actions/admin-vouchers";
import { formatPrice } from "@/lib/format";
import { gutscheinWert, normalisiereCode, type GutscheinKern } from "@/lib/rabatt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Gutscheincode im Bestellformular. Die Prüfung hier ist nur Vorschau –
 * create_order() prüft beim Absenden erneut und verrechnet verbindlich.
 *
 * Kein <form> im <form>: der Knopf ruft die Server Action direkt, Enter im
 * Feld wird abgefangen, damit nicht versehentlich die Bestellung abgeht.
 */
export function VoucherField({
  gutschein,
  onChange,
  mindestwertFehlt,
  nichtAnwendbar,
  productIds,
}: {
  gutschein: GutscheinKern | null;
  onChange: (gutschein: GutscheinKern | null) => void;
  mindestwertFehlt: boolean;
  /** Gilt nur für Warengruppen, von denen nichts im Warenkorb liegt */
  nichtAnwendbar: boolean;
  /** Artikel im Warenkorb – die Datenbank sagt, für welche der Code gilt */
  productIds: string[];
}) {
  const gruppen = gutschein?.kategorien ?? [];
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [prueft, starten] = useTransition();

  function einloesen() {
    const code = normalisiereCode(eingabe);
    if (!code) return;
    setFehler(null);
    starten(async () => {
      const ergebnis = await pruefeGutschein(code, productIds);
      if (ergebnis.gutschein) {
        onChange(ergebnis.gutschein);
        setEingabe("");
      } else {
        setFehler(ergebnis.error ?? "Dieser Gutscheincode ist ungültig.");
      }
    });
  }

  if (gutschein) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-success">
            <Ticket className="size-4" aria-hidden />
            <span>
              <span className="code font-semibold">{gutschein.code}</span> · −
              {gutscheinWert(gutschein.kind, gutschein.value)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Gutschein entfernen"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {gruppen.length > 0 ? (
          <p className="text-xs text-muted-foreground">Gilt nur für: {gruppen.join(", ")}</p>
        ) : null}
        {nichtAnwendbar ? (
          <p role="alert" className="text-xs text-destructive">
            Im Warenkorb liegt kein Artikel aus {gruppen.length === 1 ? "dieser Warengruppe" : "diesen Warengruppen"}.
            Bitte Warenkorb ergänzen oder Gutschein entfernen.
          </p>
        ) : mindestwertFehlt ? (
          <p role="alert" className="text-xs text-destructive">
            Gilt ab {formatPrice(gutschein.min_order_amount)} Warenwert netto
            {gruppen.length > 0 ? " aus diesen Warengruppen" : ""}. Bitte
            Warenkorb ergänzen oder Gutschein entfernen.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor="gutscheincode" className="text-sm font-medium">
        Gutscheincode
      </label>
      <div className="flex gap-2">
        <Input
          id="gutscheincode"
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              einloesen();
            }
          }}
          placeholder="Code eingeben"
          autoComplete="off"
          className="code uppercase"
          maxLength={40}
        />
        <Button
          type="button"
          variant="outline"
          onClick={einloesen}
          disabled={prueft || !eingabe.trim()}
        >
          {prueft ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Einlösen"}
        </Button>
      </div>
      {fehler ? (
        <p role="alert" className="text-xs text-destructive">
          {fehler}
        </p>
      ) : null}
    </div>
  );
}
