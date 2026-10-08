"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { recordStockEntries } from "@/lib/actions/stock";
import { formatDateTime, formatPrice, formatQuantity } from "@/lib/format";
import type { PosProduct } from "@/lib/queries/pos";
import {
  fasseZusammen,
  preiseNeuerArtikel,
  pruefeSumme,
  zeileStimmt,
  type RechnungAntwort,
  type RechnungPosition,
} from "@/lib/rechnung-import";
import type { Category } from "@/lib/types";

/**
 * Rechnung hochladen – lesen, prüfen, buchen.
 *
 * Der Dialog liest nichts selbst: der Route Handler liefert die gelesene
 * Rechnung und den Abgleich mit dem Stamm. Hier wird nur korrigiert und
 * bestätigt. Gebucht wird über dieselbe Sammelbuchung wie überall im
 * Wareneingang (`recordStockEntries` → `record_stock_entries`).
 *
 * Bekannte Artikel bekommen nur Bestand und Einkaufspreis: Großhandels- und
 * Ladenpreis bleiben, wie sie gepflegt sind (leeres Feld heißt „unverändert“).
 */

interface Zeile {
  key: string;
  position: RechnungPosition;
  /** null = unbekannter Code, wird neu angelegt */
  produkt: PosProduct | null;
  name: string;
  menge: number;
  ek: number;
  gh: number;
  eh: number;
  categoryId: string;
  /** Rote Zeile ausdrücklich bestätigt */
  geprueft: boolean;
}

function baueZeilen(antwort: RechnungAntwort, categories: Category[]): Zeile[] {
  const standard = antwort.vorgabeKategorieId ?? categories[0]?.id ?? "";
  return fasseZusammen(antwort.rechnung.positionen).map((position, index) => {
    const preise = preiseNeuerArtikel(position, antwort.mwstSatz);
    return {
      key: `${index}-${position.ean ?? position.name}`,
      position,
      produkt: position.ean ? (antwort.produkte[position.ean] ?? null) : null,
      name: position.name,
      menge: position.menge,
      ek: preise.ek,
      gh: preise.gh,
      eh: preise.eh,
      categoryId: position.warengruppeId ?? standard,
      geprueft: false,
    };
  });
}

/** Zeilenprobe mit der (vielleicht korrigierten) Menge. */
function stimmt(z: Zeile): boolean {
  return zeileStimmt({ ...z.position, menge: z.menge });
}

export function WareneingangRechnung({
  open,
  onOpenChange,
  categories,
  onGebucht,
}: {
  open: boolean;
  onOpenChange: (offen: boolean) => void;
  categories: Category[];
  onGebucht: (info: { zeitpunkt: string; positionen: number }) => void;
}) {
  const dateiRef = useRef<HTMLInputElement>(null);
  const [liest, setLiest] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [antwort, setAntwort] = useState<RechnungAntwort | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [summeGeprueft, setSummeGeprueft] = useState(false);
  const [doppeltOk, setDoppeltOk] = useState(false);
  const [bucht, startBuchen] = useTransition();

  function zuruecksetzen() {
    setLiest(false);
    setFehler(null);
    setAntwort(null);
    setZeilen([]);
    setSummeGeprueft(false);
    setDoppeltOk(false);
    if (dateiRef.current) dateiRef.current.value = "";
  }

  async function lesen(datei: File) {
    setLiest(true);
    setFehler(null);
    try {
      const daten = new FormData();
      daten.append("datei", datei);
      const res = await fetch("/admin/bestand/rechnung", { method: "POST", body: daten });
      const json = (await res.json().catch(() => null)) as
        | (RechnungAntwort & { error?: string })
        | null;
      if (!res.ok || !json || json.error) {
        setFehler(json?.error ?? "Die Rechnung konnte nicht gelesen werden.");
        return;
      }
      setAntwort(json);
      setZeilen(baueZeilen(json, categories));
      setSummeGeprueft(false);
      setDoppeltOk(false);
    } catch (ursache) {
      console.error("[wareneingang] Rechnung hochladen:", ursache);
      setFehler("Die Rechnung konnte nicht gelesen werden.");
    } finally {
      setLiest(false);
    }
  }

  function aendern(key: string, teil: Partial<Zeile>) {
    setZeilen((alt) => alt.map((z) => (z.key === key ? { ...z, ...teil } : z)));
  }

  const summe = antwort
    ? pruefeSumme({
        positionen: zeilen.map((z) => z.position),
        nettoGesamt: antwort.rechnung.nettoGesamt,
        nebenkostenNetto: antwort.rechnung.nebenkostenNetto,
      })
    : null;

  const roteZeilen = zeilen.filter((z) => !stimmt(z));
  const offeneRote = roteZeilen.filter((z) => !z.geprueft).length;
  const ohneGh = zeilen.filter((z) => !z.produkt && z.gh <= 0).length;
  const ohneMenge = zeilen.filter((z) => z.menge <= 0).length;
  const doppelt = antwort?.bereitsGebuchtAm ?? null;

  const gesperrt =
    zeilen.length === 0 ||
    offeneRote > 0 ||
    ohneGh > 0 ||
    ohneMenge > 0 ||
    (summe !== null && !summe.ok && !summeGeprueft) ||
    (doppelt !== null && !doppeltOk);

  const neu = zeilen.filter((z) => !z.produkt).length;
  const stueck = zeilen.reduce((s, z) => s + z.menge, 0);

  function buchen() {
    if (!antwort || gesperrt) return;
    const r = antwort.rechnung;
    const notiz = `${r.lieferant}, Rechnung ${r.rechnungsnummer}${r.datum ? ` vom ${r.datum}` : ""}`;

    startBuchen(async () => {
      const ergebnis = await recordStockEntries({
        items: zeilen.map((z) => ({
          productId: z.produkt?.id ?? null,
          name: z.produkt ? "" : z.name.trim(),
          barcode: z.position.ean,
          categoryId: z.produkt ? null : z.categoryId || null,
          quantity: z.menge,
          // Bekannte Artikel: Preise unangetastet (null heißt „unverändert“).
          unitPrice: z.produkt ? null : z.gh,
          retailPrice: z.produkt || z.eh <= 0 ? null : z.eh,
          costPrice: z.ek > 0 ? z.ek : null,
        })),
        note: notiz,
      });

      if (ergebnis.error || !ergebnis.entries?.length) {
        toast.error(ergebnis.error ?? "Der Wareneingang konnte nicht gebucht werden.");
        return;
      }

      const angelegt = ergebnis.entries.filter((e) => e.is_new_product).length;
      toast.success(
        `${formatQuantity(ergebnis.entries.length)} Positionen gebucht${
          angelegt > 0 ? `, ${formatQuantity(angelegt)} Artikel neu angelegt` : ""
        }`,
      );
      onGebucht({
        zeitpunkt: ergebnis.entries[0].created_at,
        positionen: ergebnis.entries.length,
      });
      zuruecksetzen();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(offen) => {
        if (!offen && bucht) return;
        if (!offen) zuruecksetzen();
        onOpenChange(offen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Rechnung hochladen</DialogTitle>
          <DialogDescription>
            PDF der Lieferantenrechnung wählen. Die Positionen werden gelesen und
            zur Kontrolle angezeigt; gebucht wird erst, wenn du bestätigst.
          </DialogDescription>
        </DialogHeader>

        {!antwort ? (
          <div className="space-y-3">
            <Input
              ref={dateiRef}
              type="file"
              accept="application/pdf"
              disabled={liest}
              onChange={(event) => {
                const datei = event.target.files?.[0];
                if (datei) void lesen(datei);
              }}
            />
            {liest ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Rechnung wird gelesen …
              </p>
            ) : null}
            {fehler ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {fehler}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p className="font-medium">
                {antwort.rechnung.lieferant} · Rechnung {antwort.rechnung.rechnungsnummer}
                {antwort.rechnung.datum ? ` vom ${antwort.rechnung.datum}` : ""}
              </p>
              <p className="tabular text-muted-foreground">
                {zeilen.length} Positionen · {formatQuantity(stueck)} Stück · {neu} neu ·{" "}
                {zeilen.length - neu} Zugang
              </p>
            </div>

            {doppelt ? (
              <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Diese Rechnung wurde schon gebucht ({formatDateTime(doppelt)}).
                  Nochmal zu buchen verdoppelt den Bestand.
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={doppeltOk}
                    onChange={(event) => setDoppeltOk(event.target.checked)}
                  />
                  Trotzdem buchen
                </label>
              </div>
            ) : null}

            {summe && !summe.ok ? (
              <div className="space-y-2 rounded-md border border-gold/50 bg-gold-soft px-3 py-2 text-sm text-gold">
                <p className="tabular">
                  Die Zeilen ergeben {formatPrice(summe.summe)}, die Rechnung
                  weist {formatPrice(summe.erwartet)} netto aus (ohne
                  Nebenkosten). Eine Zeile fehlt oder wurde falsch gelesen.
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={summeGeprueft}
                    onChange={(event) => setSummeGeprueft(event.target.checked)}
                  />
                  Summe geprüft, trotzdem buchen
                </label>
              </div>
            ) : (
              <p className="tabular text-xs text-muted-foreground">
                Summe geprüft: {formatPrice(summe?.summe ?? 0)} netto stimmt mit der
                Rechnung überein
                {antwort.rechnung.nebenkostenNetto > 0
                  ? ` (ohne ${formatPrice(antwort.rechnung.nebenkostenNetto)} Nebenkosten)`
                  : ""}
                .
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Artikel</th>
                    <th className="px-3 py-2 font-medium">Menge</th>
                    <th className="px-3 py-2 font-medium">EK €</th>
                    <th className="px-3 py-2 font-medium">GH €</th>
                    <th className="px-3 py-2 font-medium">Laden €</th>
                    <th className="px-3 py-2 font-medium">Warengruppe</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z) => {
                    const rot = !stimmt(z);
                    return (
                      <tr
                        key={z.key}
                        className={`border-b border-border align-top last:border-0 ${
                          rot ? "bg-destructive/5" : ""
                        }`}
                      >
                        <td className="min-w-64 px-3 py-2">
                          {z.produkt ? (
                            <>
                              <p className="font-medium">{z.produkt.name}</p>
                              <p className="tabular text-xs text-muted-foreground">
                                {z.produkt.sku} · Zugang · Bestand{" "}
                                {formatQuantity(z.produkt.freeStock)} →{" "}
                                {formatQuantity(z.produkt.freeStock + z.menge)}
                              </p>
                            </>
                          ) : (
                            <>
                              <Input
                                value={z.name}
                                onChange={(event) =>
                                  aendern(z.key, { name: event.target.value })
                                }
                                className="h-8"
                                aria-label="Bezeichnung des neuen Artikels"
                              />
                              <p className="tabular mt-1 text-xs text-muted-foreground">
                                wird angelegt
                                {z.position.ean
                                  ? ` · ${z.position.ean}`
                                  : " · ohne Barcode, bitte prüfen, ob der Artikel schon im Stamm steht"}
                              </p>
                            </>
                          )}
                          {rot ? (
                            <label className="mt-1 flex items-center gap-2 text-xs text-destructive">
                              <input
                                type="checkbox"
                                checked={z.geprueft}
                                onChange={(event) =>
                                  aendern(z.key, { geprueft: event.target.checked })
                                }
                              />
                              Zeile passt nicht zur Rechnung (
                              {formatPrice(z.position.zeilenbetrag)}) – geprüft
                            </label>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <NumericInput
                            value={z.menge}
                            onChange={(wert) => aendern(z.key, { menge: wert })}
                            className="h-8 w-20"
                            aria-label="Menge"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumericInput
                            dezimal
                            value={z.ek}
                            onChange={(wert) => aendern(z.key, { ek: wert })}
                            className="h-8 w-24"
                            aria-label="Einkaufspreis"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {z.produkt ? (
                            <span className="text-xs text-muted-foreground">unverändert</span>
                          ) : (
                            <NumericInput
                              dezimal
                              value={z.gh}
                              onChange={(wert) => aendern(z.key, { gh: wert })}
                              className="h-8 w-24"
                              aria-label="Großhandelspreis"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {z.produkt ? (
                            <span className="text-xs text-muted-foreground">unverändert</span>
                          ) : (
                            <NumericInput
                              dezimal
                              value={z.eh}
                              onChange={(wert) => aendern(z.key, { eh: wert })}
                              className="h-8 w-24"
                              aria-label="Ladenpreis"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {z.produkt ? (
                            <span className="text-xs text-muted-foreground">
                              {z.produkt.categoryName ?? "–"}
                            </span>
                          ) : (
                            <select
                              value={z.categoryId}
                              onChange={(event) =>
                                aendern(z.key, { categoryId: event.target.value })
                              }
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                              aria-label="Warengruppe"
                            >
                              {categories.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {ohneGh > 0 ? (
              <p className="text-xs text-destructive">
                {ohneGh} neue {ohneGh === 1 ? "Artikel hat" : "Artikel haben"} keinen
                Großhandelspreis – ohne ihn stünde der Artikel im Shop zum Nulltarif.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={zuruecksetzen} disabled={bucht}>
                Andere Rechnung wählen
              </Button>
              <Button type="button" onClick={buchen} disabled={gesperrt || bucht}>
                {bucht ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileUp className="size-4" aria-hidden />
                )}
                {bucht
                  ? "Wird gebucht …"
                  : `${zeilen.length} Positionen buchen`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
