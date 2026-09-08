"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PosCartItem } from "@/lib/types";

/**
 * Freie Position auf den Bon – ohne Artikelstamm, ohne Bestand.
 *
 * Nicht alles, was über den Tresen geht, ist ein Artikel im Lager: eine
 * Reparatur, eine Anlieferung, eine Schachtel aus dem Regal, die bewusst nie
 * erfasst wurde. Bisher blieb dafür nur, einen Scheinartikel anzulegen – der
 * dann im Shop steht, im Bestand mitgezählt wird und bei der nächsten Inventur
 * Fragen aufwirft.
 *
 * `create_pos_sale()` kann solche Zeilen seit Migration 018: eine Position
 * ohne `product_id` wird gebucht und abgerechnet, aber nicht vom Bestand
 * abgezogen. Es fehlte nur der Weg dorthin.
 *
 * Bewusst getrennt vom Anlegedialog nebenan: dort entsteht ein Artikel, der
 * bleibt. Hier entsteht eine Zeile, die mit dem Bon endet. Die beiden in einem
 * Dialog mit einem Schalter zusammenzulegen hieße, an der Kasse eine Frage zu
 * stellen, die niemand im Vorbeigehen richtig beantwortet.
 */
export function PosFreeLineDialog({
  open,
  onOpenChange,
  onAdd,
  pricesGross,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (zeile: PosCartItem) => void;
  /** Nur für den Hinweis unter dem Preisfeld – gerechnet wird an der Kasse */
  pricesGross: boolean;
}) {
  const [name, setName] = useState("");
  const [menge, setMenge] = useState("1");
  const [preis, setPreis] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  function zuruecksetzen() {
    setName("");
    setMenge("1");
    setPreis("");
    setFehler(null);
  }

  function hinzufuegen() {
    const bezeichnung = name.trim();
    if (!bezeichnung) {
      setFehler("Die Position braucht eine Bezeichnung – sie steht so auf dem Bon.");
      return;
    }

    const anzahl = Number(menge.replace(",", "."));
    if (!Number.isInteger(anzahl) || anzahl <= 0) {
      setFehler("Die Menge muss eine ganze Zahl über 0 sein.");
      return;
    }

    const betrag = Number(preis.replace(",", "."));
    if (!Number.isFinite(betrag) || betrag < 0) {
      setFehler("Der Preis fehlt oder ist keine Zahl.");
      return;
    }

    onAdd({
      productId: null,
      name: bezeichnung,
      // Leer und nicht „—": die Datenbank setzt den Strich selbst, wenn keine
      // Artikelnummer mitkommt. Ihn hier zu erfinden hieße, ihn an zwei
      // Stellen zu pflegen.
      sku: "",
      barcode: null,
      quantity: anzahl,
      unitPrice: betrag,
      // Kein Bestand, also keine Obergrenze: die Menge einer Dienstleistung
      // ist durch nichts im Lager begrenzt.
      maxStock: null,
    });

    zuruecksetzen();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(offen) => {
        if (!offen) zuruecksetzen();
        onOpenChange(offen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Freie Position</DialogTitle>
          <DialogDescription>
            Für alles ohne Artikelstamm – Dienstleistung, Pfand, Ware, die
            bewusst nicht im Bestand geführt wird. Die Zeile kommt auf Bon und
            Beleg, rührt den Bestand aber nicht an und legt keinen Artikel an.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="frei-name">Bezeichnung</Label>
            <Textarea
              id="frei-name"
              rows={2}
              autoFocus
              maxLength={200}
              value={name}
              placeholder="z. B. Schlüsseldienst vor Ort"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="frei-menge">Menge</Label>
              <Input
                id="frei-menge"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={menge}
                className="tabular"
                onChange={(event) => setMenge(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="frei-preis">Preis / Stück (€)</Label>
              <Input
                id="frei-preis"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={preis}
                className="tabular"
                onChange={(event) => setPreis(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  hinzufuegen();
                }}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {pricesGross
              ? "Der eingegebene Preis ist ein Endpreis inkl. USt."
              : "Der eingegebene Preis ist ein Nettopreis, die USt. kommt hinzu."}
          </p>
        </div>

        {fehler ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {fehler}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={hinzufuegen}>
            Auf den Bon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
