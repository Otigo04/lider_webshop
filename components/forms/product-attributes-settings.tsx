"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Palette, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createAttributeValue,
  createProductAttribute,
  deleteAttributeValue,
  deleteProductAttribute,
} from "@/lib/actions/attributes";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductAttributeGroup, ProductAttributeKind } from "@/lib/types";

/**
 * Merkmale pflegen (Migration 032).
 *
 * Zwei Ebenen auf einer Seite: oben die Merkmale, unter jedem seine Werte.
 * Getrennte Seiten wären sauberer aufgeteilt und in der Bedienung schlechter –
 * ein Merkmal ohne Werte ist nutzlos, und wer „Farbe" anlegt, will im selben
 * Atemzug Rot, Blau und Grün eintragen.
 *
 * Kein Umbenennen: löschen und neu anlegen reicht für den seltenen Fall, so
 * wie bei den Artikel-Flags.
 */

/**
 * Startfarbe des Farbwählers. Nicht Schwarz: der erste Klick auf „Anlegen"
 * würde sonst reihenweise schwarze Kreise erzeugen, weil niemand den Wähler
 * anfasst, wenn dort schon etwas Plausibles steht.
 */
const START_HEX = "#c0392b";

function AnlegenButton({ label = "Anlegen" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird angelegt …" : label}
    </Button>
  );
}

export function ProductAttributesSettings({
  attributes,
}: {
  attributes: ProductAttributeGroup[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ProductAttributeKind>("color");

  const [state, formAction] = useActionState<AdminFormState, FormData>(
    createProductAttribute,
    {},
  );

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state.success, router]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  async function merkmalLoeschen(id: string, name: string) {
    const formData = new FormData();
    formData.set("id", id);
    const ergebnis = await deleteProductAttribute({}, formData);
    if (ergebnis.error) {
      toast.error(ergebnis.error);
      return;
    }
    toast.success(`„${name}“ gelöscht.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Merkmale angelegt. Ein Merkmal ist die Frage („Farbe“), die
          Werte darunter sind die Antworten („Rot“, „Blau“).
        </p>
      ) : (
        <ul className="space-y-4">
          {attributes.map((attribut) => (
            <li
              key={attribut.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {attribut.kind === "color" ? (
                    <Palette className="size-4 text-brand" aria-hidden />
                  ) : (
                    <Tag className="size-4 text-brand" aria-hidden />
                  )}
                  {attribut.name}
                  <span className="eyebrow rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {attribut.kind === "color" ? "Farbkreise" : "Schildchen"}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => merkmalLoeschen(attribut.id, attribut.name)}
                >
                  <Trash2 className="size-4" aria-hidden /> Merkmal löschen
                </Button>
              </div>

              <WerteListe attribut={attribut} />
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------- neues Merkmal */}
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="merkmal-name" className="text-xs">
            Neues Merkmal
          </Label>
          <Input
            id="merkmal-name"
            name="name"
            maxLength={60}
            placeholder="z. B. Farbe"
            className="w-56"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium">Darstellung</span>
          <div className="flex gap-1.5">
            <ArtKnopf
              aktiv={kind === "color"}
              onClick={() => setKind("color")}
              icon={Palette}
              label="Farbkreise"
            />
            <ArtKnopf
              aktiv={kind === "text"}
              onClick={() => setKind("text")}
              icon={Tag}
              label="Schildchen"
            />
          </div>
          <input type="hidden" name="kind" value={kind} />
        </div>

        <AnlegenButton label="Merkmal anlegen" />
      </form>
    </div>
  );
}

function ArtKnopf({
  aktiv,
  onClick,
  icon: Icon,
  label,
}: {
  aktiv: boolean;
  onClick: () => void;
  icon: typeof Palette;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
        aktiv
          ? "border-brand bg-brand text-brand-foreground"
          : "border-input bg-card hover:bg-muted"
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

/**
 * Werte eines Merkmals.
 *
 * Der Farbwähler steht nur bei Farbmerkmalen: eine Größe hat keinen Farbton,
 * und ein Feld, das nichts bewirkt, ist eine Falle.
 */
function WerteListe({ attribut }: { attribut: ProductAttributeGroup }) {
  const router = useRouter();
  const [hex, setHex] = useState(START_HEX);

  const [state, formAction] = useActionState<AdminFormState, FormData>(
    createAttributeValue,
    {},
  );

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state.success, router]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  async function wertLoeschen(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    const ergebnis = await deleteAttributeValue({}, formData);
    if (ergebnis.error) {
      toast.error(ergebnis.error);
      return;
    }
    toast.success("Wert gelöscht.");
    router.refresh();
  }

  return (
    <div className="mt-3">
      {attribut.values.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Werte – das Merkmal taucht erst auf, wenn es welche hat.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {attribut.values.map((wert) => (
            <li
              key={wert.id}
              className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-2 pr-1 text-sm"
            >
              {attribut.kind === "color" ? (
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-black/15"
                  style={{ backgroundColor: wert.hex ?? "transparent" }}
                />
              ) : null}
              {wert.label}
              <button
                type="button"
                aria-label={`${wert.label} löschen`}
                onClick={() => wertLoeschen(wert.id)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="attribute_id" value={attribut.id} />

        <div className="space-y-1">
          <Label htmlFor={`wert-${attribut.id}`} className="text-xs">
            Neuer Wert
          </Label>
          <Input
            id={`wert-${attribut.id}`}
            name="label"
            maxLength={60}
            placeholder={attribut.kind === "color" ? "z. B. Rot" : "z. B. XL"}
            className="h-9 w-44"
          />
        </div>

        {attribut.kind === "color" ? (
          <div className="space-y-1">
            <Label htmlFor={`hex-${attribut.id}`} className="text-xs">
              Farbe
            </Label>
            {/* Der Systemwähler statt einer eigenen Palette: er kennt die
                Farbe des Artikels besser als jede Vorauswahl von uns. */}
            <input
              id={`hex-${attribut.id}`}
              type="color"
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
            />
            <input type="hidden" name="hex" value={hex} />
          </div>
        ) : (
          <input type="hidden" name="hex" value="" />
        )}

        <div className="pb-px">
          <AnlegenButton label="Wert hinzufügen" />
        </div>
      </form>
    </div>
  );
}
