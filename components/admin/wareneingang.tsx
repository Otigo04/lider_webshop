"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  PackagePlus,
  Plus,
  ScanBarcode,
  Sparkles,
  Trash2,
} from "lucide-react";
import { lookupPosProduct } from "@/lib/actions/pos";
import { setProductAttributes } from "@/lib/actions/attributes";
import { recordStockEntries } from "@/lib/actions/stock";
import type { PosProduct } from "@/lib/queries/pos";
import { MerkmalAuswahl } from "@/components/admin/merkmal-auswahl";
import { NumericInput } from "@/components/numeric-input";
import { PosProductSearch } from "@/components/pos/pos-product-search";
import { KassenStatus, useKassenMeldung } from "@/components/pos/kassen-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, formatQuantity } from "@/lib/format";
import { useScanFocus } from "@/lib/use-scan-focus";
import { cn } from "@/lib/utils";
import type { Category, ProductAttributeGroup } from "@/lib/types";

/**
 * Wareneingang – Bestandsaufnahme im Fließband.
 *
 * Wenn eine Lieferung ausgepackt wird, zählt eines: Karton auf, Etikett unter
 * den Scanner, Stückzahl tippen, nächster Karton. Jeder Mausklick dazwischen
 * kostet mehr Zeit als der ganze Rest der Zeile. Deshalb steht hier kein
 * Formular pro Artikel, sondern eine Liste, die beim Scannen wächst, und
 * gebucht wird am Ende alles auf einmal.
 *
 * Bekannte und unbekannte Ware landen in derselben Liste: ob ein Artikel neu
 * ist, merkt man beim Auspacken nicht, und ein eigener Weg für Neuanlagen
 * hieße, mitten in der Lieferung die Oberfläche zu wechseln. Neue Zeilen
 * verlangen nur zusätzlich Bezeichnung und Warengruppe.
 */

interface Zeile {
  /** Nur für React – die Zeile hat vor dem Buchen keine Identität in der DB */
  key: string;
  /** null = Artikel wird mit dieser Buchung angelegt */
  productId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  menge: number;
  /** Leer heißt „Preis unverändert lassen", nicht „auf 0 setzen" */
  ghPreis: string;
  ehPreis: string;
  bestand: number | null;
  aktuellGh: number | null;
  aktuellEh: number | null;
  /**
   * Merkmalswerte für neu anzulegende Artikel (Migration 032). Bei bekannter
   * Ware bleibt das Feld leer: ein Wareneingang bucht Menge und Preis, er
   * ist nicht der Ort, an dem Stammdaten überarbeitet werden.
   */
  merkmale: string[];
}

/**
 * Ab dieser Länge ist eine getippte „Menge" in Wahrheit ein Barcode.
 *
 * Nach dem Scannen springt der Fokus ins Mengenfeld, damit die Stückzahl ohne
 * Mausgriff eingegeben werden kann. Wer dort den nächsten Artikel scannt,
 * schriebe den Barcode als Menge hinein. Acht Stellen trennt beides sauber:
 * kein Wareneingang hat 10.000.000 Stück, keine EAN ist kürzer.
 */
const BARCODE_AB_STELLEN = 8;

export function Wareneingang({
  categories,
  attributes,
  zuletztKategorieId,
}: {
  categories: Category[];
  /** Gepflegte Merkmale – je Neuanlage-Zeile zugeklappt angeboten */
  attributes: ProductAttributeGroup[];
  /** Warengruppe des zuletzt angelegten Artikels; Vorgabe der ersten Neuanlage */
  zuletztKategorieId: string | null;
}) {
  const router = useRouter();
  // Dieselben Signale wie an der Kasse: gebucht, unbekannt, Fehler, fertig.
  const { meldung, melden } = useKassenMeldung();

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [scan, setScan] = useState("");
  const [notiz, setNotiz] = useState("");
  const [suchend, setSuchend] = useState(false);
  const [buchend, startBuchen] = useTransition();

  const scanRef = useRef<HTMLInputElement>(null);
  // Spiegel der Liste für Prüfungen außerhalb des Renderns – sonst hinge
  // jede Rückruffunktion an den Zeilen und würde bei jeder Menge neu gebaut.
  const zeilenRef = useRef(zeilen);
  useEffect(() => {
    zeilenRef.current = zeilen;
  }, [zeilen]);

  /*
   * Menge beim Betreten des Feldes merken. Wird dort statt einer Zahl der
   * nächste Artikel gescannt, muss die alte Menge zurück – die neue ist dann
   * ein Barcode (siehe mengeAbschliessen).
   */
  const mengeVorher = useRef(1);

  // Getippte Zeichen außerhalb eines Feldes gehören dem Scanner.
  useScanFocus(scanRef);

  /** Fokus in das Mengenfeld einer Zeile, Inhalt markiert. */
  const mengeFokussieren = useCallback((key: string) => {
    // Erst nach dem Rendern der neuen Zeile – vorher gibt es das Feld nicht.
    requestAnimationFrame(() => {
      const feld = document.getElementById(`menge-${key}`);
      if (feld instanceof HTMLInputElement) {
        feld.focus();
        feld.select();
      }
    });
  }, []);

  /**
   * Bekannten Artikel aufnehmen. Steht er schon in der Liste, wird die Menge
   * erhöht – zweimal denselben Karton scannen heißt „zwei Stück", nicht
   * „zwei Zeilen".
   */
  const aufnehmen = useCallback(
    (product: PosProduct) => {
      const vorhanden = zeilenRef.current.find(
        (zeile) => zeile.productId === product.id,
      );

      if (vorhanden) {
        setZeilen((aktuell) =>
          aktuell.map((zeile) =>
            zeile.key === vorhanden.key
              ? { ...zeile, menge: zeile.menge + 1 }
              : zeile,
          ),
        );
        melden(
          "treffer",
          `${product.name} · ${formatQuantity(vorhanden.menge + 1)} Stück`,
          product.sku,
        );
        mengeFokussieren(vorhanden.key);
        return;
      }

      const key = crypto.randomUUID();
      setZeilen((aktuell) => [
        ...aktuell,
        {
          key,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          categoryId: product.categoryId,
          menge: 1,
          ghPreis: "",
          ehPreis: "",
          bestand: product.freeStock,
          aktuellGh: product.unitPrice,
          aktuellEh: product.retailPrice,
          merkmale: [],
        },
      ]);
      melden(
        "treffer",
        product.name,
        `${product.sku} · Bestand ${formatQuantity(product.freeStock)}`,
      );
      mengeFokussieren(key);
    },
    [melden, mengeFokussieren],
  );

  /** Unbekannter Code – neue Zeile, der Cursor springt in die Bezeichnung. */
  const neueZeile = useCallback(
    (barcode: string | null) => {
      const key = crypto.randomUUID();
      setZeilen((aktuell) => [
        ...aktuell,
        {
          key,
          productId: null,
          name: "",
          sku: null,
          barcode,
          /*
           * Die zuletzt benutzte Warengruppe ist fast immer die richtige: eine
           * Lieferung kommt selten quer durch das Sortiment. Innerhalb der
           * Aufnahme ist das die vorige Zeile, bei der ersten die Gruppe des
           * zuletzt angelegten Artikels – und erst wenn es noch gar keinen
           * gibt, die erste der Liste.
           */
          categoryId:
            zeilenRef.current.at(-1)?.categoryId ??
            zuletztKategorieId ??
            categories[0]?.id ??
            null,
          menge: 1,
          ghPreis: "",
          ehPreis: "",
          bestand: null,
          aktuellGh: null,
          aktuellEh: null,
          merkmale: [],
        },
      ]);
      requestAnimationFrame(() => {
        document.getElementById(`name-${key}`)?.focus();
      });
      return key;
    },
    [categories, zuletztKategorieId],
  );

  const scanVerarbeiten = useCallback(
    async (code: string) => {
      const gesucht = code.trim();
      if (!gesucht) return;

      setSuchend(true);
      try {
        const { product } = await lookupPosProduct(gesucht);
        if (product) {
          aufnehmen(product);
        } else {
          // Kein Treffer ist beim Wareneingang der Regelfall, kein Fehler:
          // neue Ware hat noch keinen Artikelstamm.
          neueZeile(gesucht);
          melden(
            "unbekannt",
            "Neue Ware – Bezeichnung und Preise eintragen.",
            gesucht,
          );
        }
      } catch (fehler) {
        console.error("[wareneingang] Scan:", fehler);
        melden("fehler", "Der Artikel konnte nicht nachgeschlagen werden.", gesucht);
      } finally {
        setSuchend(false);
        setScan("");
      }
    },
    [aufnehmen, neueZeile, melden],
  );

  function aendern(key: string, teil: Partial<Zeile>) {
    setZeilen((aktuell) =>
      aktuell.map((zeile) => (zeile.key === key ? { ...zeile, ...teil } : zeile)),
    );
  }

  function entfernen(key: string) {
    setZeilen((aktuell) => aktuell.filter((zeile) => zeile.key !== key));
    scanRef.current?.focus();
  }

  /**
   * Enter im Mengenfeld: zurück ins Scannerfeld, der nächste Karton kann
   * kommen. Steckt statt einer Menge ein Barcode darin, war es kein Tippen,
   * sondern ein Scan in das falsche Feld – dann wird er als solcher behandelt
   * und die alte Menge wiederhergestellt.
   */
  function mengeAbschliessen(zeile: Zeile, roh: string) {
    const ziffern = roh.replace(/\D/g, "");
    if (ziffern.length >= BARCODE_AB_STELLEN) {
      aendern(zeile.key, { menge: mengeVorher.current });
      void scanVerarbeiten(ziffern);
      return;
    }
    scanRef.current?.focus();
  }

  const stueck = zeilen.reduce((summe, zeile) => summe + zeile.menge, 0);
  const neue = zeilen.filter((zeile) => zeile.productId === null).length;

  function buchen() {
    if (zeilen.length === 0) return;

    const ohneName = zeilen.find(
      (zeile) => zeile.productId === null && zeile.name.trim() === "",
    );
    if (ohneName) {
      melden("warnung", "Ein neuer Artikel braucht eine Bezeichnung.");
      document.getElementById(`name-${ohneName.key}`)?.focus();
      return;
    }
    const ohneMenge = zeilen.find((zeile) => zeile.menge === 0);
    if (ohneMenge) {
      melden(
        "warnung",
        `Für „${ohneMenge.name || "eine Zeile"}" fehlt die Menge.`,
      );
      document.getElementById(`menge-${ohneMenge.key}`)?.focus();
      return;
    }
    const ohnePreis = zeilen.find(
      (zeile) => zeile.productId === null && zeile.ghPreis.trim() === "",
    );
    if (ohnePreis) {
      melden("warnung", `Für „${ohnePreis.name}" fehlt der Großhandelspreis.`);
      document.getElementById(`gh-${ohnePreis.key}`)?.focus();
      return;
    }

    startBuchen(async () => {
      const ergebnis = await recordStockEntries({
        items: zeilen.map((zeile) => ({
          productId: zeile.productId,
          name: zeile.name.trim(),
          barcode: zeile.barcode?.trim() || null,
          categoryId: zeile.productId === null ? zeile.categoryId : null,
          quantity: zeile.menge,
          unitPrice: zeile.ghPreis.trim().replace(",", "."),
          retailPrice: zeile.ehPreis.trim().replace(",", "."),
        })),
        note: notiz.trim() || null,
      });

      if (ergebnis.error || !ergebnis.entries) {
        melden(
          "fehler",
          ergebnis.error ?? "Der Wareneingang konnte nicht gebucht werden.",
        );
        return;
      }

      /*
       * Merkmale der neu angelegten Artikel nachtragen.
       *
       * record_stock_entries() kennt keine Merkmale – sie gehören nicht in die
       * Bestandsbuchung, und die Funktion um eine zweite Aufgabe zu erweitern
       * hieße, die Transaktion für etwas zu öffnen, das den Bestand nicht
       * berührt. Die Journalzeilen kommen in der Reihenfolge der Eingabe
       * zurück; darüber findet jede Zeile ihre frisch vergebene Artikel-ID.
       *
       * Scheitert das Nachtragen, bleibt die Lieferung trotzdem gebucht: die
       * Ware liegt im Regal, die Farbe lässt sich in der Artikelverwaltung
       * ergänzen. Umgekehrt wäre es falsch herum.
       */
      await Promise.all(
        zeilen.map(async (zeile, index) => {
          if (zeile.productId !== null || zeile.merkmale.length === 0) return;
          const productId = ergebnis.entries?.[index]?.product_id;
          if (!productId) return;
          const merkmalErgebnis = await setProductAttributes({
            productId,
            valueIds: zeile.merkmale,
          });
          if (merkmalErgebnis.error) {
            console.error("[wareneingang] Merkmale:", merkmalErgebnis.error);
          }
        }),
      );

      const angelegt = ergebnis.entries.filter((eintrag) => eintrag.is_new_product);
      melden(
        "abschluss",
        `${formatQuantity(ergebnis.entries.length)} ${
          ergebnis.entries.length === 1 ? "Position" : "Positionen"
        } gebucht`,
        angelegt.length > 0
          ? `${formatQuantity(angelegt.length)} Artikel neu angelegt`
          : undefined,
      );

      setZeilen([]);
      setNotiz("");
      setScan("");
      scanRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <div>
      {/* ------------------------------------------------------------- Scan */}
      <div className="rounded-lg border-2 border-brand/40 bg-brand-soft p-5">
        <label
          htmlFor="wareneingang-scan"
          className="flex items-center gap-2 text-sm font-medium text-brand"
        >
          <ScanBarcode className="size-4" aria-hidden />
          Barcode scannen
        </label>
        <KassenStatus
          meldung={meldung}
          bereitText="Nächsten Karton scannen."
          className="mt-2 bg-card"
        />

        <div className="relative mt-3">
          <Input
            id="wareneingang-scan"
            ref={scanRef}
            value={scan}
            autoFocus
            autoComplete="off"
            placeholder="Scanner auslösen oder Code eintippen und Enter"
            onChange={(event) => setScan(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void scanVerarbeiten(scan);
            }}
            className="h-16 border-2 border-brand/40 bg-card px-4 text-lg tabular focus-visible:border-brand"
          />
          {suchend ? (
            <Loader2
              className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-brand"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bekannte Ware kommt mit ihren Daten in die Liste, unbekannte als
          Neuanlage. Nach dem Scan steht der Cursor in der Menge; Enter bringt
          ihn zurück hierher.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          {/* Zweiter Weg für Ware ohne lesbares Etikett – dieselbe Suche wie
              an der Kasse, deshalb keine zweite Umsetzung. */}
          <PosProductSearch preisModus="wholesale" onSelect={aufnehmen} />
          <Button type="button" variant="outline" onClick={() => neueZeile(null)}>
            <Plus className="size-4" aria-hidden />
            Zeile ohne Barcode
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------ Liste */}
      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2.5 text-sm font-medium">
          <span>Aufnahme</span>
          <span className="tabular text-muted-foreground">
            {formatQuantity(stueck)} Stück · {zeilen.length}{" "}
            {zeilen.length === 1 ? "Position" : "Positionen"}
            {neue > 0
              ? ` · ${formatQuantity(neue)} neu`
              : ""}
          </span>
        </div>

        {zeilen.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">
            Noch nichts aufgenommen. Ersten Artikel scannen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Artikel</th>
                  <th className="px-2 py-2 font-medium">Warengruppe</th>
                  <th className="px-2 py-2 text-right font-medium">Menge</th>
                  <th className="px-2 py-2 text-right font-medium">GH €</th>
                  <th className="px-2 py-2 text-right font-medium">EH €</th>
                  <th className="px-2 py-2 text-right font-medium">Bestand</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {zeilen.map((zeile) => (
                  <tr
                    key={zeile.key}
                    className={cn(
                      "border-b border-border last:border-0 align-top",
                      zeile.productId === null && "bg-gold-soft/40",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      {zeile.productId === null ? (
                        <>
                          <Input
                            id={`name-${zeile.key}`}
                            value={zeile.name}
                            maxLength={200}
                            placeholder="Bezeichnung"
                            onChange={(event) =>
                              aendern(zeile.key, { name: event.target.value })
                            }
                            className="h-9 min-w-56"
                          />
                          <p className="mt-1 flex items-center gap-1 text-xs text-gold">
                            <Sparkles className="size-3" aria-hidden />
                            neuer Artikel
                            {zeile.barcode ? (
                              <span className="code text-muted-foreground">
                                · {zeile.barcode}
                              </span>
                            ) : null}
                          </p>
                          {/* Nur bei Neuanlagen: bei bekannter Ware bucht der
                              Wareneingang Menge und Preis, er ist nicht der
                              Ort für Stammdatenpflege. */}
                          <MerkmalAuswahl
                            attributes={attributes}
                            selected={zeile.merkmale}
                            onChange={(merkmale) =>
                              aendern(zeile.key, { merkmale })
                            }
                            idPrefix={`we-${zeile.key}`}
                            className="mt-2 max-w-sm bg-card"
                          />
                        </>
                      ) : (
                        <>
                          <p className="font-medium">{zeile.name}</p>
                          <p className="code text-xs text-muted-foreground">
                            {zeile.sku}
                            {zeile.barcode ? ` · ${zeile.barcode}` : ""}
                          </p>
                        </>
                      )}
                    </td>

                    <td className="px-2 py-2.5">
                      {zeile.productId === null ? (
                        <select
                          value={zeile.categoryId ?? ""}
                          onChange={(event) =>
                            aendern(zeile.key, { categoryId: event.target.value })
                          }
                          className="h-9 w-40 rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>

                    <td className="px-2 py-2.5">
                      <NumericInput
                        id={`menge-${zeile.key}`}
                        value={zeile.menge}
                        aria-label={`Menge für ${zeile.name || "neuen Artikel"}`}
                        onChange={(menge) => aendern(zeile.key, { menge })}
                        onFocus={() => {
                          mengeVorher.current = zeile.menge;
                        }}
                        onEnter={(roh) => mengeAbschliessen(zeile, roh)}
                        className="h-9 w-24 text-right text-base font-semibold"
                      />
                    </td>

                    <td className="px-2 py-2.5">
                      <Input
                        id={`gh-${zeile.key}`}
                        type="text"
                        inputMode="decimal"
                        value={zeile.ghPreis}
                        aria-label="Großhandelspreis"
                        placeholder={
                          zeile.aktuellGh !== null
                            ? formatPrice(zeile.aktuellGh)
                            : "Preis"
                        }
                        onChange={(event) =>
                          aendern(zeile.key, { ghPreis: event.target.value })
                        }
                        className="h-9 w-24 text-right tabular"
                      />
                    </td>

                    <td className="px-2 py-2.5">
                      <Input
                        id={`eh-${zeile.key}`}
                        type="text"
                        inputMode="decimal"
                        value={zeile.ehPreis}
                        aria-label="Einzelhandelspreis"
                        placeholder={
                          zeile.aktuellEh !== null
                            ? formatPrice(zeile.aktuellEh)
                            : "optional"
                        }
                        onChange={(event) =>
                          aendern(zeile.key, { ehPreis: event.target.value })
                        }
                        className="h-9 w-24 text-right tabular"
                      />
                    </td>

                    <td className="px-2 py-2.5 text-right text-sm tabular">
                      {zeile.bestand === null ? (
                        <span className="text-muted-foreground">neu</span>
                      ) : (
                        <span>
                          <span className="text-muted-foreground">
                            {formatQuantity(zeile.bestand)}
                          </span>
                          {" → "}
                          <span className="font-semibold">
                            {formatQuantity(zeile.bestand + zeile.menge)}
                          </span>
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${zeile.name || "Zeile"} entfernen`}
                        onClick={() => entfernen(zeile.key)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- Buchen */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-md space-y-2">
          <Label htmlFor="wareneingang-notiz">
            Notiz zur Lieferung <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="wareneingang-notiz"
            rows={2}
            maxLength={500}
            value={notiz}
            placeholder="z. B. Lieferschein 4711, Spedition Müller"
            onChange={(event) => setNotiz(event.target.value)}
          />
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12"
          disabled={zeilen.length === 0 || buchend}
          onClick={buchen}
        >
          <PackagePlus className="size-4" aria-hidden />
          {buchend
            ? "Wird gebucht …"
            : `Wareneingang buchen (${formatQuantity(stueck)} Stück)`}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Leere Preisfelder bleiben unverändert – der bisherige Preis steht als
        blasser Vorschlag im Feld. Gebucht wird alles zusammen oder gar nichts.
      </p>
    </div>
  );
}
