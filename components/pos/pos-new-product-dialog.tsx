"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createQuickProduct } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
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
import type { Category } from "@/lib/types";

/**
 * Barcode unbekannt – Artikel direkt an der Kasse anlegen.
 *
 * Öffnet sich automatisch, wenn ein Scan ins Leere läuft; der gescannte Code
 * steht dann schon im Barcode-Feld. Nach dem Anlegen wandert der Artikel
 * sofort auf den Bon, damit der Kunde nicht wartet.
 *
 * Die Felder werden nicht per Effekt zurückgesetzt: die Kasse hängt den
 * gescannten Code als React-Key an, wodurch die Komponente bei jedem neuen
 * Code frisch aufgebaut wird.
 */
export function PosNewProductDialog({
  open,
  onOpenChange,
  barcode,
  categories,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  categories: Category[];
  onCreated: (product: PosProduct) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [felder, setFelder] = useState({
    name: "",
    barcode,
    category_id: categories[0]?.id ?? "",
    unit_price: "",
    stock_available: "1",
  });

  function speichern() {
    setFehler(null);
    startTransition(async () => {
      const ergebnis = await createQuickProduct({
        name: felder.name,
        barcode: felder.barcode || undefined,
        category_id: felder.category_id,
        unit_price: felder.unit_price,
        stock_available: felder.stock_available,
      });

      if (ergebnis.error || !ergebnis.product) {
        setFehler(ergebnis.error ?? "Der Artikel konnte nicht angelegt werden.");
        return;
      }

      toast.success(`${ergebnis.product.name} angelegt (${ergebnis.product.sku}).`);
      onCreated(ergebnis.product);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Artikel unbekannt – jetzt anlegen</DialogTitle>
          <DialogDescription>
            Der gescannte Code steht in keinem Artikel. Die Artikelnummer vergibt
            der Nummernkreis der Warengruppe; Foto und Beschreibung lassen sich
            später in der Artikelverwaltung nachtragen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pos-name">Bezeichnung</Label>
            <Input
              id="pos-name"
              value={felder.name}
              autoFocus
              maxLength={200}
              onChange={(event) =>
                setFelder((f) => ({ ...f, name: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-barcode">Barcode</Label>
            <Input
              id="pos-barcode"
              value={felder.barcode}
              maxLength={64}
              className="tabular"
              onChange={(event) =>
                setFelder((f) => ({ ...f, barcode: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-category">Warengruppe</Label>
            <select
              id="pos-category"
              value={felder.category_id}
              onChange={(event) =>
                setFelder((f) => ({ ...f, category_id: event.target.value }))
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-price">Preis / Stück (€)</Label>
            <Input
              id="pos-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={felder.unit_price}
              className="tabular"
              onChange={(event) =>
                setFelder((f) => ({ ...f, unit_price: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-stock">Bestand</Label>
            <Input
              id="pos-stock"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={felder.stock_available}
              className="tabular"
              onChange={(event) =>
                setFelder((f) => ({ ...f, stock_available: event.target.value }))
              }
            />
          </div>
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
            disabled={pending}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={speichern} disabled={pending}>
            {pending ? "Wird angelegt …" : "Anlegen und auf den Bon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
