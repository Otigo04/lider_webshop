"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createInvoiceOrder, type InvoiceActionState } from "@/lib/actions/admin-invoices";
import { CustomerCombobox } from "@/components/admin/customer-combobox";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/format";
import { satzText } from "@/lib/rabatt";
import type { AdminProductRow } from "@/lib/queries/admin";
import {
  belegSummen,
  findeArtikel,
  istCode,
  positionenPayload,
  positionsFehler,
  positionSumme,
  stufenpreis,
  type Position,
} from "@/lib/rechnung-positionen";
import { ZAHLUNGSVERMERK_OPTIONEN, type ZahlungsvermerkKey } from "@/lib/zahlungsvermerk";
import type { AppUser } from "@/lib/types";
import { cn } from "@/lib/utils";

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={disabled || pending}>
      {pending ? "Wird gespeichert …" : label}
    </Button>
  );
}

/** Zwei Knöpfe, einer davon gewählt – für Belegart und Kundenart. */
function Wahl<T extends string>({
  wert,
  onChange,
  optionen,
  name,
}: {
  wert: T;
  onChange: (neu: T) => void;
  optionen: { wert: T; label: string }[];
  name: string;
}) {
  return (
    <div role="group" aria-label={name} className="inline-flex rounded-md border border-border p-0.5">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          aria-pressed={wert === o.wert}
          onClick={() => onChange(o.wert)}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            wert === o.wert ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Eingabefeld ganz oben: hier wird gescannt und gesucht. */
const EINGABE_ID = "rechnung-eingabe";

/**
 * Neue Rechnung: eine Liste von Positionen, jede entweder ein Katalogartikel
 * oder eine freie Position.
 *
 * Der Admin entscheidet beim Erfassen, nicht vorab: ein gescannter oder
 * getippter Code, den es im Katalog gibt (Strichcode oder Artikelnummer),
 * wird eine Katalogposition. Kennt der Katalog ihn nicht, wird es eine freie
 * Position mit dem Code im Barcodefeld, und es geht von Hand weiter. „Freie
 * Position" legt von Anfang an eine leere freie Zeile an.
 *
 * Gebucht wird immer als Bestellung samt Rechnung (create_admin_order,
 * Migration 079): Katalogzeilen buchen Bestand ab und bekommen die
 * Sonderkondition, freie Zeilen nicht.
 */
export function InvoiceForm({
  customers,
  products,
  konditionen = {},
}: {
  customers: AppUser[];
  products: AdminProductRow[];
  /** Sonderkondition je Kunden-ID in Prozent (Migration 054/056) */
  konditionen?: Record<string, number>;
}) {
  const router = useRouter();
  // Rechnung oder Lieferschein (ohne Preise), Kunde mit Konto oder nur mit Namen.
  const [beleg, setBeleg] = useState<"rechnung" | "lieferschein">("rechnung");
  const [kundeArt, setKundeArt] = useState<"konto" | "frei">("konto");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [gast, setGast] = useState({ name: "", strasse: "", plz: "", ort: "" });
  const [konditionAn, setKonditionAn] = useState(true);
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [eingabe, setEingabe] = useState("");
  // Feld, das nach dem nächsten Rendern den Cursor bekommt (kein State: das
  // Ergebnis hängt nur am Rendern, das die Eingabe ohnehin auslöst).
  const fokusId = useRef<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [zahlKey, setZahlKey] = useState<ZahlungsvermerkKey>("ziel");
  const [zahlFrei, setZahlFrei] = useState("");

  const [state, formAction] = useActionState<InvoiceActionState, FormData>(
    createInvoiceOrder,
    {},
  );

  useEffect(() => {
    if (!state.orderId) return;
    if (state.beleg === "lieferschein") {
      toast.success("Lieferschein angelegt.");
      // Der Lieferschein ist eine Datei zum Drucken: gleich in einem eigenen Tab auf.
      window.open(`/admin/orders/${state.orderId}/dokumente?art=lieferschein`, "_blank");
    } else {
      toast.success("Rechnung angelegt.");
    }
    router.push(`/admin/orders/${state.orderId}`);
  }, [state.orderId, state.beleg, router]);

  // Cursor nach dem Hinzufügen dorthin, wo es weitergeht.
  useEffect(() => {
    if (!fokusId.current) return;
    document.getElementById(fokusId.current)?.focus();
    fokusId.current = null;
  });

  const produktNachId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const vorschlaege = useMemo(() => {
    const term = eingabe.trim().toLowerCase();
    if (term.length < 2) return [];
    return products
      .filter((p) =>
        [p.name, p.sku, p.barcode ?? ""].some((wert) => wert.toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [products, eingabe]);

  function aendern(key: string, aenderung: (p: Position) => Position) {
    setPositionen((aktuell) => aktuell.map((p) => (p.key === key ? aenderung(p) : p)));
  }

  /** Katalogartikel hinzufügen; derselbe Artikel noch einmal erhöht die Menge. */
  function katalogHinzu(produktId: string) {
    const produkt = produktNachId.get(produktId);
    if (!produkt) return;
    setPositionen((aktuell) => {
      const vorhanden = aktuell.find((p) => p.art === "katalog" && p.productId === produktId);
      if (vorhanden && vorhanden.art === "katalog") {
        const menge = vorhanden.quantity + 1;
        return aktuell.map((p) =>
          p.key === vorhanden.key
            ? {
                ...vorhanden,
                quantity: menge,
                unitPrice: vorhanden.preisManuell
                  ? vorhanden.unitPrice
                  : (stufenpreis(produkt.variants, menge) ?? vorhanden.unitPrice),
              }
            : p,
        );
      }
      return [
        ...aktuell,
        {
          art: "katalog",
          key: crypto.randomUUID(),
          productId: produktId,
          quantity: 1,
          unitPrice: stufenpreis(produkt.variants, 1) ?? 0,
          preisManuell: false,
        },
      ];
    });
    setEingabe("");
    fokusId.current = EINGABE_ID;
  }

  function freiHinzu(vorbelegung: { barcode?: string; description?: string } = {}) {
    const key = crypto.randomUUID();
    setPositionen((aktuell) => [
      ...aktuell,
      {
        art: "frei",
        key,
        barcode: vorbelegung.barcode ?? "",
        description: vorbelegung.description ?? "",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
    setEingabe("");
    // Ist der Code schon da, geht es bei der Beschreibung weiter, sonst beim Code.
    fokusId.current =
      vorbelegung.barcode || vorbelegung.description ? `pos-${key}-preis` : `pos-${key}-barcode`;
    return key;
  }

  /** Enter im Eingabefeld: bekannter Code → Katalog, sonst frei. */
  function uebernehmen(text: string) {
    const t = text.trim();
    if (!t) return;
    const treffer = findeArtikel(products, t);
    if (treffer) {
      katalogHinzu(treffer.id);
      return;
    }
    if (istCode(t)) {
      const key = freiHinzu({ barcode: t });
      fokusId.current = `pos-${key}-text`;
    } else {
      freiHinzu({ description: t });
    }
  }

  const lieferschein = beleg === "lieferschein";
  // Sonderkondition gibt es nur mit Konto und nur auf der Rechnung.
  const kundenSatz = kundeArt === "konto" && customerId ? (konditionen[customerId] ?? 0) : 0;
  const summen = belegSummen(positionen, konditionAn ? kundenSatz : 0);
  const fehler = positionsFehler(positionen, { ohnePreise: lieferschein });
  const kundeFehlt = kundeArt === "konto" ? !customerId : !gast.name.trim();

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <Label>Was soll angelegt werden?</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Wahl
            name="Belegart"
            wert={beleg}
            onChange={setBeleg}
            optionen={[
              { wert: "rechnung", label: "Rechnung" },
              { wert: "lieferschein", label: "Lieferschein" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {lieferschein
              ? "Der Lieferschein trägt Positionen und Mengen, keine Preise. Bestand wird abgebucht, die Rechnung lässt sich später aus der Bestellung erzeugen."
              : "Rechnung mit Preisen und Steuer; sie wird dem Kunden per Mail geschickt, wenn er ein Konto hat."}
          </p>
        </div>
      </section>

      <section className="max-w-2xl space-y-2">
        <Label>Kunde</Label>
        <Wahl
          name="Kundenart"
          wert={kundeArt}
          onChange={setKundeArt}
          optionen={[
            { wert: "konto", label: "Kunde mit Konto" },
            { wert: "frei", label: "Ohne Konto, nur Name" },
          ]}
        />
        {kundeArt === "konto" ? (
          <div className="max-w-md pt-1">
            <CustomerCombobox customers={customers} value={customerId} onChange={setCustomerId} />
          </div>
        ) : (
          <div className="grid gap-3 pt-1 sm:grid-cols-[2fr_2fr_1fr_2fr]">
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor="gast-name" className="text-xs">
                Name / Firma
              </Label>
              <Input
                id="gast-name"
                value={gast.name}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setGast((g) => ({ ...g, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="gast-strasse" className="text-xs">
                Straße (optional)
              </Label>
              <Input
                id="gast-strasse"
                value={gast.strasse}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setGast((g) => ({ ...g, strasse: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gast-plz" className="text-xs">
                PLZ
              </Label>
              <Input
                id="gast-plz"
                value={gast.plz}
                maxLength={12}
                autoComplete="off"
                onChange={(event) => setGast((g) => ({ ...g, plz: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gast-ort" className="text-xs">
                Ort
              </Label>
              <Input
                id="gast-ort"
                value={gast.ort}
                maxLength={80}
                autoComplete="off"
                onChange={(event) => setGast((g) => ({ ...g, ort: event.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-4">
              Ohne Registrierung: der Beleg trägt nur diese Angaben, es gibt keine Mail und keine
              Sonderkondition.
            </p>
          </div>
        )}
      </section>

      <form
        action={(formData) => {
          formData.set("beleg", beleg);
          formData.set("kunde_art", kundeArt);
          formData.set("customer_id", kundeArt === "konto" ? (customerId ?? "") : "");
          formData.set("customer_label", kundeArt === "frei" ? gast.name.trim() : "");
          formData.set("customer_street", kundeArt === "frei" ? gast.strasse.trim() : "");
          formData.set("customer_zip", kundeArt === "frei" ? gast.plz.trim() : "");
          formData.set("customer_city", kundeArt === "frei" ? gast.ort.trim() : "");
          formData.set("items", JSON.stringify(positionenPayload(positionen)));
          formData.set("apply_condition", konditionAn && !lieferschein ? "1" : "0");
          formData.set("delivery_address", deliveryAddress);
          formData.set("delivery_method", deliveryAddress.trim() ? "shipping" : "pickup");
          formAction(formData);
        }}
        // Ein Scanner schickt nach dem Code Enter. Das darf nie die Rechnung
        // abschicken; weiter geht es über die Felder selbst.
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
          }
        }}
        className="space-y-6"
      >
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-64 flex-1">
              <Label htmlFor={EINGABE_ID}>Barcode scannen oder Artikel suchen</Label>
              <div className="relative mt-2">
                <Input
                  id={EINGABE_ID}
                  value={eingabe}
                  onChange={(event) => setEingabe(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    uebernehmen(eingabe);
                  }}
                  autoComplete="off"
                  placeholder="Code scannen oder Name, Artikelnummer …"
                />
                {vorschlaege.length > 0 ? (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                    {vorschlaege.map((produkt) => (
                      <button
                        key={produkt.id}
                        type="button"
                        onClick={() => katalogHinzu(produkt.id)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="block font-medium">{produkt.name}</span>
                        <span className="block text-xs text-muted-foreground tabular">
                          {produkt.sku}
                          {produkt.barcode ? ` · ${produkt.barcode}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => freiHinzu()}>
              <PenLine className="size-4" aria-hidden /> Freie Position
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ein Code aus dem Katalog wird eine Katalogposition (Bestand wird abgebucht). Kennt der
            Katalog ihn nicht, wird es eine freie Position: Beschreibung und Preis tippst du selbst.
          </p>

          <div className="mt-4 space-y-3">
            {positionen.map((position, index) => {
              const produkt =
                position.art === "katalog" ? produktNachId.get(position.productId) : undefined;
              const id = (teil: string) => `pos-${position.key}-${teil}`;
              return (
                <div
                  key={position.key}
                  className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
                >
                  {position.art === "katalog" ? (
                    <div className="min-w-48 flex-1">
                      <p className="flex items-center gap-2 text-xs text-muted-foreground tabular">
                        <span className="rounded border border-brand/30 bg-brand-soft px-1.5 py-px font-medium text-brand">
                          Katalog
                        </span>
                        {produkt?.sku}
                        {produkt?.barcode ? ` · ${produkt.barcode}` : ""}
                      </p>
                      <p className="font-medium">{produkt?.name ?? "Unbekannter Artikel"}</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-44 space-y-1">
                        <Label htmlFor={id("barcode")} className="text-xs">
                          <span className="mr-1.5 rounded border border-border bg-muted px-1.5 py-px font-medium text-muted-foreground">
                            Frei
                          </span>
                          Barcode
                        </Label>
                        <Input
                          id={id("barcode")}
                          value={position.barcode}
                          maxLength={64}
                          autoComplete="off"
                          placeholder="optional, scannen"
                          className="code"
                          onChange={(event) =>
                            aendern(position.key, (p) =>
                              p.art === "frei" ? { ...p, barcode: event.target.value } : p,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            document.getElementById(id("text"))?.focus();
                          }}
                        />
                      </div>
                      <div className="min-w-48 flex-1 space-y-1">
                        <Label htmlFor={id("text")} className="text-xs">
                          Beschreibung
                        </Label>
                        <Input
                          id={id("text")}
                          value={position.description}
                          maxLength={500}
                          onChange={(event) =>
                            aendern(position.key, (p) =>
                              p.art === "frei" ? { ...p, description: event.target.value } : p,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            document.getElementById(id("menge"))?.focus();
                          }}
                        />
                      </div>
                    </>
                  )}

                  <div className="w-24 space-y-1">
                    <Label htmlFor={id("menge")} className="text-xs">
                      Menge
                    </Label>
                    <NumericInput
                      id={id("menge")}
                      value={position.quantity}
                      onChange={(menge) =>
                        aendern(position.key, (p) => {
                          if (p.art === "frei") return { ...p, quantity: menge };
                          // Ohne eigenen Preis zieht eine neue Menge die passende Staffel nach.
                          const staffel = produktNachId.get(p.productId);
                          return {
                            ...p,
                            quantity: menge,
                            unitPrice: p.preisManuell
                              ? p.unitPrice
                              : (stufenpreis(staffel?.variants ?? [], menge) ?? p.unitPrice),
                          };
                        })
                      }
                      onEnter={() =>
                        document.getElementById(lieferschein ? EINGABE_ID : id("preis"))?.focus()
                      }
                    />
                  </div>
                  {/* Ein Lieferschein trägt keine Preise: Feld und Summe entfallen. */}
                  {lieferschein ? null : (
                  <div className="w-32 space-y-1">
                    <Label htmlFor={id("preis")} className="text-xs">
                      Preis / Stück (€)
                    </Label>
                    <NumericInput
                      id={id("preis")}
                      dezimal
                      value={position.unitPrice}
                      onChange={(preis) =>
                        aendern(position.key, (p) =>
                          p.art === "frei"
                            ? { ...p, unitPrice: preis }
                            : { ...p, unitPrice: preis, preisManuell: true },
                        )
                      }
                      // Enter im Preis: Position fertig, der Cursor springt zum
                      // Scanfeld für die nächste.
                      onEnter={() => document.getElementById(EINGABE_ID)?.focus()}
                    />
                  </div>
                  )}
                  {lieferschein ? null : (
                    <p className="w-24 pb-2 text-right text-sm font-medium tabular">
                      {formatPrice(positionSumme(position))}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Position ${index + 1} entfernen`}
                    onClick={() => setPositionen((aktuell) => aktuell.filter((p) => p.key !== position.key))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
            {positionen.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Noch keine Position. Einen Code scannen, einen Artikel suchen oder „Freie Position“
                wählen.
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-2">
          <Label htmlFor="delivery_address">Lieferadresse (optional)</Label>
          <Textarea
            id="delivery_address"
            value={deliveryAddress}
            onChange={(event) => setDeliveryAddress(event.target.value)}
            rows={3}
            placeholder="Leer lassen für Selbstabholung"
          />
        </section>

        <section className="space-y-2">
          <Label htmlFor="notes">Anmerkungen</Label>
          <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
        </section>

        {lieferschein ? null : (
        <section className="max-w-md space-y-2">
          <Label htmlFor="payment_key">Zahlung</Label>
          <select
            id="payment_key"
            name="payment_key"
            value={zahlKey}
            onChange={(event) => setZahlKey(event.target.value as ZahlungsvermerkKey)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {ZAHLUNGSVERMERK_OPTIONEN.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          {zahlKey === "frei" ? (
            <Textarea
              name="payment_free"
              value={zahlFrei}
              onChange={(event) => setZahlFrei(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Text, der auf der Rechnung unter den Summen steht"
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Steht auf der Rechnung anstelle des Zahlungsziels.
          </p>
        </section>
        )}

        {lieferschein ? null : (
        <div className="space-y-2 rounded-md border border-border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Warenwert netto</span>
            <span className="tabular">{formatPrice(summen.warenwert)}</span>
          </div>
          {kundenSatz > 0 ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={konditionAn}
                  onChange={(event) => setKonditionAn(event.target.checked)}
                  className="size-4 accent-[var(--brand)]"
                />
                <span className={cn(konditionAn ? "text-success" : "text-muted-foreground line-through")}>
                  Sonderkondition {satzText(kundenSatz)}
                  <span className="text-muted-foreground"> (nur auf Katalogartikel)</span>
                </span>
              </label>
              <span className={cn("tabular", konditionAn ? "text-success" : "text-muted-foreground")}>
                −{formatPrice(konditionAn ? summen.kundenRabatt : 0)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm text-muted-foreground">Summe netto</span>
            <span className="text-xl font-semibold tabular">{formatPrice(summen.netto)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Die Umsatzsteuer wird beim Anlegen auf die Summe gerechnet.
          </p>
        </div>
        )}

        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton
            label={lieferschein ? "Lieferschein erstellen" : "Rechnung anlegen"}
            disabled={kundeFehlt || fehler !== null}
          />
          {positionen.length > 0 && fehler ? (
            <p className="text-sm text-muted-foreground">{fehler}</p>
          ) : null}
          {positionen.length > 0 && kundeFehlt ? (
            <p className="text-sm text-muted-foreground">
              {kundeArt === "konto" ? "Kunde wählen." : "Name des Kunden angeben."}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
