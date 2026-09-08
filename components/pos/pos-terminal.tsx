"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Camera,
  CreditCard,
  Loader2,
  Minus,
  PencilLine,
  Plus,
  Printer,
  Receipt,
  ScanBarcode,
  Trash2,
  UserRound,
} from "lucide-react";
import { completePosSale, lookupPosProduct } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
import { NumericInput } from "@/components/numeric-input";
import { PosCustomerStep, type PosCustomerChoice } from "@/components/pos/pos-customer-step";
import { PosCameraScanner } from "@/components/pos/pos-camera-scanner";
import { PosFreeLineDialog } from "@/components/pos/pos-free-line-dialog";
import { PosNewProductDialog } from "@/components/pos/pos-new-product-dialog";
import { PosProductSearch } from "@/components/pos/pos-product-search";
import { KassenStatus, useKassenMeldung } from "@/components/pos/kassen-status";
import { useScanFocus } from "@/lib/use-scan-focus";
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
import { formatPrice, formatQuantity } from "@/lib/format";
import { counterUnitPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import {
  POS_PRICE_MODE_LABELS,
  type AppUser,
  type Category,
  type PosCartItem,
  type PosPaymentMethod,
  type ProductAttributeGroup,
} from "@/lib/types";

interface AbschlussInfo {
  saleId: string;
  receiptNumber: string;
  totalAmount: number;
  receiptUrl: string | null;
}

/**
 * Ladenkasse.
 *
 * Der USB-Scanner meldet sich am Rechner als Tastatur an: er tippt den Barcode
 * und schließt mit Enter ab. Die Oberfläche muss deshalb nichts über Geräte
 * wissen – sie muss nur dafür sorgen, dass die Eingabe immer im Scannerfeld
 * landet, auch wenn jemand vorher woanders hingeklickt hat. Genau das macht
 * der Tastatur-Wächter weiter unten.
 *
 * Bewusst keine optimistische Anzeige beim Abschluss: erst wenn die Datenbank
 * den Bestand abgebucht hat, gilt der Verkauf. Ein Bon, der am Bildschirm
 * fertig ist und in der Buchhaltung fehlt, wäre das schlimmere Übel.
 */
export function PosTerminal({
  customers,
  categories,
  attributes,
  zuletztKategorieId,
  vatRate,
  pricesGross,
}: {
  customers: AppUser[];
  categories: Category[];
  /** Merkmale für die Schnellanlage – zugeklappt, bis jemand sie aufzieht */
  attributes: ProductAttributeGroup[];
  /** Warengruppe des zuletzt angelegten Artikels als Vorgabe der Schnellanlage */
  zuletztKategorieId: string | null;
  /** Steuersatz aus den Firmendaten – kein fester Wert im Code */
  vatRate: number;
  /** true = eingegebene Preise sind Endpreise inkl. USt. */
  pricesGross: boolean;
}) {
  const router = useRouter();
  // Ton und Statusleiste in einem: jeder Vorgang meldet sich hörbar und
  // sichtbar (components/pos/kassen-status.tsx).
  const { meldung, melden } = useKassenMeldung();

  const [kunde, setKunde] = useState<PosCustomerChoice | null>(null);
  /*
   * Wer den Laden aufschließt und sofort scannt, hat noch keinen Kunden
   * gewählt. Der Kundenschritt entscheidet dann selbst auf Barverkauf und
   * reicht den Code hier durch – gebucht wird er, sobald der Bon steht.
   *
   * Als Ref und nicht als Zustand: der Code ist eine Übergabe, kein Zustand,
   * der die Oberfläche beschreibt. Ihn nach dem Buchen zurückzusetzen wäre
   * sonst ein setState im Effekt und damit ein zweiter Renderdurchlauf.
   */
  const startCodeRef = useRef<string | null>(null);
  const [bon, setBon] = useState<PosCartItem[]>([]);
  const [scan, setScan] = useState("");
  const [zahlart, setZahlart] = useState<PosPaymentMethod>("cash");
  const [notiz, setNotiz] = useState("");
  const [suchend, setSuchend] = useState(false);
  const [neuDialog, setNeuDialog] = useState<{ offen: boolean; code: string }>({
    offen: false,
    code: "",
  });
  const [kamera, setKamera] = useState(false);
  const [freieZeile, setFreieZeile] = useState(false);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [abschluss, setAbschluss] = useState<AbschlussInfo | null>(null);
  const [buchend, startBuchen] = useTransition();

  const scanRef = useRef<HTMLInputElement>(null);
  // Spiegel des Bons für Prüfungen außerhalb des Renderns (siehe aufDenBon).
  const bonRef = useRef(bon);
  useEffect(() => {
    bonRef.current = bon;
  }, [bon]);
  /*
   * Die Kamera zählt hier bewusst nicht mit: sie ist eine Spalte neben der
   * Kasse, kein Fenster darüber. Der Tastatur-Wächter bleibt deshalb scharf,
   * und Handscanner und Kamera lassen sich gleichzeitig benutzen.
   */
  const dialogOffen =
    neuDialog.offen || freieZeile || bestaetigen || abschluss !== null;

  // Der Scanner tippt blind los, egal wo der Fokus steht (lib/use-scan-focus.ts).
  useScanFocus(scanRef, dialogOffen);

  useEffect(() => {
    if (kunde && !dialogOffen) scanRef.current?.focus();
  }, [kunde, dialogOffen]);

  /**
   * Artikel auf den Bon. Menge erhöhen, wenn er schon draufsteht – zweimal
   * denselben Artikel scannen heißt „zwei Stück", nicht „zwei Zeilen".
   *
   * Die Prüfung läuft gegen bonRef statt im setState-Updater: dort dürfen
   * keine Meldungen ausgelöst werden, React ruft den Updater unter Umständen
   * mehrfach auf und der Kassierer bekäme dieselbe Warnung doppelt.
   *
   * Hier hängt auch der Quittungston: jeder Weg auf den Bon – Kamera,
   * Handscanner, getippter Code, Namenssuche, neu angelegte Ware – läuft
   * durch diese Funktion. Ein Ton pro gebuchtem Artikel, keiner bei
   * Fehlgriffen wie leerem Lager.
   */
  const preisModus = kunde?.priceMode ?? "retail";
  // Spiegel wie bonRef: aufDenBon hängt sonst am Modus und würde bei jedem
  // Kundenwechsel neu erzeugt, obwohl die Funktion sich nicht ändert.
  const modusRef = useRef(preisModus);
  useEffect(() => {
    modusRef.current = preisModus;
  }, [preisModus]);

  const aufDenBon = useCallback((product: PosProduct, menge = 1) => {
    const aktuell = bonRef.current;
    const index = aktuell.findIndex((zeile) => zeile.productId === product.id);
    const neueMenge = (index >= 0 ? aktuell[index].quantity : 0) + menge;

    if (product.freeStock <= 0) {
      melden("warnung", `${product.name} ist nicht mehr am Lager.`, product.sku);
      return false;
    }
    if (neueMenge > product.freeStock) {
      melden(
        "warnung",
        `${product.name}: nur noch ${formatQuantity(product.freeStock)} Stück verfügbar.`,
        product.sku,
      );
      return false;
    }

    // Händler mit Konto zahlen die Shop-Staffel, Privatkundschaft den
    // Ladenpreis des Artikels (lib/pricing.ts).
    const preis = counterUnitPrice(product, neueMenge, modusRef.current);

    if (index >= 0) {
      const kopie = [...aktuell];
      kopie[index] = { ...kopie[index], quantity: neueMenge, unitPrice: preis };
      setBon(kopie);
    } else {
      setBon([
        ...aktuell,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          quantity: neueMenge,
          unitPrice: preis,
          maxStock: product.freeStock,
        },
      ]);
    }
    return true;
  }, [melden]);

  /**
   * Freie Position auf den Bon.
   *
   * Anders als aufDenBon() ohne Bestandsprüfung und ohne Zusammenlegen: eine
   * Dienstleistung hat keinen Bestand, und zwei gleichlautende freie Zeilen
   * sind zwei Vorgänge und nicht zweimal derselbe. Wer wirklich zwei Stück
   * meint, trägt die Menge ein.
   */
  function freieZeileAufDenBon(zeile: PosCartItem) {
    setBon((aktuell) => [...aktuell, zeile]);
    melden(
      "treffer",
      zeile.name,
      `freie Position · ${formatPrice(zeile.unitPrice)} je Stück`,
    );
    scanRef.current?.focus();
  }

  const scanVerarbeiten = useCallback(async (code: string) => {
    const gesucht = code.trim();
    if (!gesucht) return;

    setSuchend(true);
    try {
      const { product } = await lookupPosProduct(gesucht);
      if (product) {
        if (aufDenBon(product)) {
          melden(
            "treffer",
            product.name,
            `${product.sku} · ${formatQuantity(product.freeStock)} Stück am Lager`,
          );
        }
        // Weiter geht es blind: der nächste Scan soll ohne Mausklick sitzen.
        scanRef.current?.focus();
      } else {
        // Kein Treffer ist der Regelfall bei neuer Ware, kein Fehler. Die
        // Kamera darf dabei weiterlaufen – sie liegt neben der Kasse, nicht
        // darüber. Sie hält über `pausiert` nur ihre Meldungen zurück, damit
        // sie nicht hinter dem offenen Anlegedialog weiterbucht. Der Fokus
        // bleibt beim Dialog, deshalb hier kein Griff ins Scannerfeld.
        melden("unbekannt", "Code unbekannt – Artikel anlegen.", gesucht);
        setNeuDialog({ offen: true, code: gesucht });
      }
    } catch (fehler) {
      console.error("[kasse] Scan:", fehler);
      melden("fehler", "Der Artikel konnte nicht nachgeschlagen werden.", gesucht);
    } finally {
      setSuchend(false);
      setScan("");
    }
  }, [aufDenBon, melden]);

  /*
   * Ein Code, der schon vor der Kundenwahl gescannt wurde, wird gebucht,
   * sobald der Bon steht. Steht hinter scanVerarbeiten, weil er die Funktion
   * braucht.
   */
  useEffect(() => {
    if (!kunde) return;
    const code = startCodeRef.current;
    if (code === null) return;
    startCodeRef.current = null;
    void scanVerarbeiten(code);
  }, [kunde, scanVerarbeiten]);

  function mengeAendern(index: number, delta: number) {
    const zeile = bon[index];
    if (!zeile) return;

    const neu = zeile.quantity + delta;
    if (neu <= 0) {
      entfernen(index);
      return;
    }
    if (zeile.maxStock !== null && neu > zeile.maxStock) {
      melden(
        "warnung",
        `${zeile.name}: nur noch ${formatQuantity(zeile.maxStock)} Stück verfügbar.`,
        zeile.sku ?? undefined,
      );
      return;
    }

    // Preis neu auflösen: eine größere Menge kann in die nächste Staffel fallen.
    setBon(bon.map((z, i) => (i === index ? { ...z, quantity: neu } : z)));
  }

  function preisAendern(index: number, preis: number) {
    setBon((aktuell) =>
      aktuell.map((zeile, i) =>
        // Negative Preise gibt es an der Kasse nicht; die Datenbank lehnt sie
        // ohnehin ab, hier fällt es nur früher auf.
        i === index ? { ...zeile, unitPrice: Math.max(preis, 0) } : zeile,
      ),
    );
  }

  function entfernen(index: number) {
    setBon((aktuell) => aktuell.filter((_, i) => i !== index));
  }

  /**
   * Summen. Rechnet exakt wie create_pos_sale() in der Datenbank – die Anzeige
   * darf sich vom gebuchten Beleg nicht unterscheiden.
   */
  const summen = useMemo(() => {
    const positionen = bon.reduce(
      (summe, zeile) => summe + zeile.unitPrice * zeile.quantity,
      0,
    );
    const runden = (wert: number) => Math.round(wert * 100) / 100;

    if (pricesGross) {
      const brutto = runden(positionen);
      const netto = runden(brutto / (1 + vatRate / 100));
      return { netto, ust: runden(brutto - netto), brutto };
    }
    const netto = runden(positionen);
    const ust = runden((netto * vatRate) / 100);
    return { netto, ust, brutto: runden(netto + ust) };
  }, [bon, pricesGross, vatRate]);

  const stueckzahl = bon.reduce((summe, zeile) => summe + zeile.quantity, 0);

  function verkaufBuchen() {
    if (!kunde || bon.length === 0) return;

    startBuchen(async () => {
      const ergebnis = await completePosSale({
        items: bon.map((zeile) => ({
          productId: zeile.productId,
          name: zeile.name,
          sku: zeile.sku,
          barcode: zeile.barcode,
          quantity: zeile.quantity,
          unitPrice: zeile.unitPrice,
        })),
        customerId: kunde.customerId,
        customerLabel: kunde.customerId ? null : kunde.label,
        paymentMethod: zahlart,
        note: notiz.trim() || null,
      });

      if (ergebnis.error || !ergebnis.sale) {
        melden(
          "fehler",
          ergebnis.error ?? "Der Verkauf konnte nicht gebucht werden.",
        );
        setBestaetigen(false);
        return;
      }

      setBestaetigen(false);
      setAbschluss({
        saleId: ergebnis.sale.id,
        receiptNumber: ergebnis.sale.receiptNumber,
        totalAmount: ergebnis.sale.totalAmount,
        receiptUrl: ergebnis.sale.receiptUrl,
      });
      melden(
        "abschluss",
        `Verkauf gebucht · ${formatPrice(ergebnis.sale.totalAmount)}`,
        `Beleg ${ergebnis.sale.receiptNumber} · Bestand aktualisiert`,
      );
      router.refresh();
    });
  }

  function neuerVorgang(kundeBehalten: boolean) {
    setBon([]);
    setNotiz("");
    setScan("");
    setAbschluss(null);
    setZahlart("cash");
    if (!kundeBehalten) setKunde(null);
  }

  if (!kunde) {
    return (
      <PosCustomerStep
        customers={customers}
        onWeiter={(auswahl, code) => {
          startCodeRef.current = code ?? null;
          setKunde(auswahl);
        }}
      />
    );
  }

  return (
    <div>
      {/* Kopf der Arbeitsfläche auf dunklem Grund: an der Kasse steht der
          Kassierer vor einem hellen Bildschirm und muss auf einen Blick sehen,
          für wen und zu welchen Preisen gerade kassiert wird. Der farbige
          Streifen links trägt die Preisliste – Gold für Ladenpreise, Blau für
          Händler –, damit sie nicht nur als Wort dasteht. */}
      <div className="overflow-hidden rounded-lg bg-surface-dark text-surface-dark-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className={cn(
                "hidden h-12 w-1.5 rounded-full sm:block",
                preisModus === "retail" ? "bg-gold" : "bg-brand-hover",
              )}
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Kasse</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface-dark-muted">
                <UserRound className="size-4" aria-hidden />
                {kunde.label}
                {kunde.customerId ? null : " · ohne Kundenkonto"}
                <span
                  className={cn(
                    "eyebrow rounded px-1.5 py-0.5",
                    preisModus === "retail"
                      ? "bg-gold text-gold-foreground"
                      : "bg-white/15 text-surface-dark-foreground",
                  )}
                >
                  {POS_PRICE_MODE_LABELS[preisModus]}
                </span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              className="border-surface-dark-border bg-transparent text-surface-dark-foreground hover:bg-white/10 hover:text-surface-dark-foreground"
            >
              <Link href="/kasse/verkaeufe">
                <Receipt className="size-4" aria-hidden /> Verkäufe
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="text-surface-dark-muted hover:bg-white/10 hover:text-surface-dark-foreground"
              onClick={() => neuerVorgang(false)}
            >
              Kunde wechseln
            </Button>
          </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "h-1",
            preisModus === "retail" ? "bg-gold" : "bg-brand-hover",
          )}
        />
      </div>

      {/* Die Kamera bekommt eine eigene Spalte ganz links, statt sich über die
          Seite zu legen: Bon und Abrechnung bleiben sichtbar und bedienbar,
          während gescannt wird. Ohne Kamera fällt die Spalte weg und der
          Inhalt rückt zurück.

          Die Kameraspalte ist bewusst breit (22rem, ab xl 28rem): am Laptop
          hält jemand den Artikel eine Armlänge entfernt vor die eingebaute
          Kamera, und auf einem daumennagelgroßen Bild ist nicht zu erkennen,
          ob der Barcode überhaupt im Zielrahmen liegt.

          Drei Spalten passen dafür nicht mehr in die 72rem-Spalte des
          Adminbereichs – dem Bon blieben sonst gut 430 px, zu wenig für
          Bezeichnung, Menge, Preis und Summe nebeneinander. Die Kasse tritt
          deshalb aus dem Rahmen und wächst mit der Bildschirmbreite; sie ist
          die einzige Adminseite, die als Arbeitsfläche gedacht ist. Der Rand
          reicht dafür aus, es entsteht kein Querlauf. */}
      <div
        className={cn(
          "mt-6 grid gap-6 lg:items-start",
          kamera
            ? "lg:grid-cols-[22rem_1fr_22rem] lg:-mx-16 xl:grid-cols-[28rem_1fr_22rem] xl:-mx-32 2xl:-mx-48"
            : "lg:grid-cols-[1fr_22rem]",
        )}
      >
        {kamera ? (
          <PosCameraScanner
            onClose={() => setKamera(false)}
            pausiert={dialogOffen}
            onCode={(code) => {
              void scanVerarbeiten(code);
            }}
          />
        ) : null}

        {/* --------------------------------------------------- Scan und Bon */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="pos-scan"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <ScanBarcode className="size-4 text-brand" aria-hidden />
              Barcode scannen
            </label>
            {/* Ergänzung zum Handscanner, kein Ersatz: beide laufen
                nebeneinander, weil die Kamera kein Fenster mehr aufzieht. */}
            <Button
              type="button"
              variant={kamera ? "secondary" : "outline"}
              size="sm"
              aria-pressed={kamera}
              onClick={() => setKamera((an) => !an)}
            >
              <Camera className="size-4" aria-hidden />
              {kamera ? "Kamera ausblenden" : "Kamera zuschalten"}
            </Button>
          </div>
          <KassenStatus meldung={meldung} className="mt-2" />

          <div className="relative mt-3">
            <Input
              id="pos-scan"
              ref={scanRef}
              value={scan}
              autoComplete="off"
              autoFocus
              inputMode="text"
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
            Der Scanner arbeitet wie eine Tastatur. Getippte Zeichen springen
            automatisch in dieses Feld, egal wo der Mauszeiger steht.
          </p>

          {/* Zweiter Weg auf den Bon: über die Bezeichnung, wenn das Etikett
              fehlt oder nicht lesbar ist. Daneben der dritte, für alles ohne
              Artikelstamm – die Reihenfolge ist die der Häufigkeit. */}
          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <PosProductSearch
              preisModus={preisModus}
              onSelect={(product) => {
                if (aufDenBon(product)) {
                  melden("treffer", product.name, product.sku);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setFreieZeile(true)}
            >
              <PencilLine className="size-4" aria-hidden />
              Freie Position
            </Button>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2.5 text-sm font-medium">
              <span>Bon</span>
              <span className="tabular text-muted-foreground">
                {formatQuantity(stueckzahl)} Stück · {bon.length}{" "}
                {bon.length === 1 ? "Position" : "Positionen"}
              </span>
            </div>

            {bon.length === 0 ? (
              <p className="px-4 py-16 text-center text-sm text-muted-foreground">
                Noch nichts erfasst. Ersten Artikel scannen.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {bon.map((zeile, index) => (
                  <li
                    key={`${zeile.productId ?? "frei"}-${index}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{zeile.name}</p>
                      {/* Eine freie Zeile hat keine Artikelnummer – statt
                          einer leeren Zeile steht dort, was sie ist. Sonst
                          sähe sie aus wie ein Artikel, dessen Nummer fehlt. */}
                      {zeile.productId === null ? (
                        <p className="text-xs text-gold">
                          freie Position · nicht im Bestand
                        </p>
                      ) : (
                        <p className="code text-xs text-muted-foreground">
                          {zeile.sku}
                          {zeile.barcode ? ` · ${zeile.barcode}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Menge von ${zeile.name} verringern`}
                        onClick={() => mengeAendern(index, -1)}
                      >
                        <Minus className="size-4" aria-hidden />
                      </Button>
                      <span className="w-10 text-center text-lg font-semibold tabular">
                        {zeile.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Menge von ${zeile.name} erhöhen`}
                        onClick={() => mengeAendern(index, 1)}
                      >
                        <Plus className="size-4" aria-hidden />
                      </Button>
                    </div>

                    <div className="w-28">
                      <NumericInput
                        dezimal
                        aria-label={`Stückpreis von ${zeile.name}`}
                        value={zeile.unitPrice}
                        onChange={(preis) => preisAendern(index, preis)}
                        className="h-9 text-right"
                      />
                    </div>

                    <p className="w-24 text-right font-semibold tabular">
                      {formatPrice(zeile.unitPrice * zeile.quantity)}
                    </p>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${zeile.name} entfernen`}
                      onClick={() => entfernen(index)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ------------------------------------------------ Summe und Zahlung */}
        <aside
          className={cn(
            "rounded-lg border-2 bg-card lg:sticky lg:top-24",
            preisModus === "retail" ? "border-gold/50" : "border-brand/30",
          )}
        >
          <div
            className={cn(
              "flex items-baseline justify-between gap-2 border-b border-border px-5 py-3",
              preisModus === "retail" ? "bg-gold-soft" : "bg-brand-soft",
            )}
          >
            <p
              className={cn(
                "text-sm font-semibold",
                preisModus === "retail" ? "text-gold" : "text-brand",
              )}
            >
              Abrechnung
            </p>
            <p className="eyebrow text-muted-foreground">
              {POS_PRICE_MODE_LABELS[preisModus]}
            </p>
          </div>

          <dl className="space-y-2 px-5 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Zwischensumme netto</dt>
              <dd className="tabular">{formatPrice(summen.netto)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                USt. {formatQuantity(vatRate)} %
              </dt>
              <dd className="tabular">{formatPrice(summen.ust)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="font-semibold">Gesamt</dt>
              <dd
                className={cn(
                  "text-2xl font-bold tabular",
                  preisModus === "retail" ? "text-gold" : "text-brand",
                )}
              >
                {formatPrice(summen.brutto)}
              </dd>
            </div>
          </dl>

          <div className="border-t border-border px-5 py-4">
            <p className="text-sm font-medium">Zahlart</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Zahlartknopf
                aktiv={zahlart === "cash"}
                onClick={() => setZahlart("cash")}
                icon={Banknote}
                label="Bar"
              />
              <Zahlartknopf
                aktiv={zahlart === "card"}
                onClick={() => setZahlart("card")}
                icon={CreditCard}
                label="Karte"
              />
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="pos-note">Notiz auf dem Beleg</Label>
              <Textarea
                id="pos-note"
                rows={2}
                maxLength={500}
                value={notiz}
                onChange={(event) => setNotiz(event.target.value)}
                placeholder="optional"
              />
            </div>

            <Button
              type="button"
              size="lg"
              className="mt-4 h-12 w-full text-base"
              disabled={bon.length === 0 || buchend}
              onClick={() => setBestaetigen(true)}
            >
              Verkauf abschließen
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {pricesGross
                ? "Eingegebene Preise sind Endpreise inkl. USt."
                : "Eingegebene Preise sind Nettopreise, die USt. kommt hinzu."}
            </p>
          </div>
        </aside>
      </div>

      <PosFreeLineDialog
        open={freieZeile}
        onOpenChange={setFreieZeile}
        onAdd={freieZeileAufDenBon}
        pricesGross={pricesGross}
      />

      <PosNewProductDialog
        key={neuDialog.code}
        open={neuDialog.offen}
        onOpenChange={(offen) => setNeuDialog((d) => ({ ...d, offen }))}
        barcode={neuDialog.code}
        categories={categories}
        attributes={attributes}
        zuletztKategorieId={zuletztKategorieId}
        onCreated={(product) => {
          // Anlegen und Buchen sind ein Vorgang – deshalb eine Meldung, und
          // zwar die des Anlegens: dass der Artikel auf dem Bon steht, sieht
          // man daneben.
          aufDenBon(product);
          melden("neu", `${product.name} angelegt und gebucht.`, product.sku);
        }}
      />

      {/* ----------------------------------------------------- Rückfrage */}
      <Dialog open={bestaetigen} onOpenChange={setBestaetigen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verkauf abschließen?</DialogTitle>
            <DialogDescription>
              {formatQuantity(stueckzahl)} Stück über {formatPrice(summen.brutto)}{" "}
              ({zahlart === "cash" ? "bar" : "Karte"}) für {kunde.label}. Der
              Bestand wird sofort abgebucht, der Beleg erzeugt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBestaetigen(false)}
              disabled={buchend}
            >
              Zurück
            </Button>
            <Button type="button" onClick={verkaufBuchen} disabled={buchend}>
              {buchend ? "Wird gebucht …" : "Jetzt abschließen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------- Nach dem Bon */}
      <Dialog
        open={abschluss !== null}
        onOpenChange={(offen) => {
          if (!offen) neuerVorgang(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            {/*
              Am Tresen ist die Frage nach dem Kassieren immer dieselbe: Bon
              dazu oder nicht? Deshalb steht sie bei Ladenpreisen in der
              Überschrift und nicht als einer von drei gleichrangigen Knöpfen.
              Ein Händler mit Konto bekommt ohnehin eine Rechnung – ihn danach
              zu fragen wäre eine Frage zu viel.
            */}
            <DialogTitle>
              {preisModus === "retail"
                ? "Bon drucken?"
                : `Verkauf ${abschluss?.receiptNumber} gebucht`}
            </DialogTitle>
            <DialogDescription>
              {abschluss?.receiptNumber} ·{" "}
              {abschluss ? formatPrice(abschluss.totalAmount) : ""} ·{" "}
              {zahlart === "cash" ? "bar" : "Karte"}
              {abschluss?.receiptUrl
                ? ""
                : " · Der Beleg konnte nicht erzeugt werden – er lässt sich unter „Verkäufe“ nachholen."}
            </DialogDescription>
          </DialogHeader>

          {/*
            Eigene Fußzeile statt DialogFooter: dort stehen die Knöpfe in einer
            Zeile nebeneinander, und drei davon liefen im Kassenfenster rechts
            aus dem Rahmen. Hier trägt der Hauptweg eine ganze Zeile, der Rest
            teilt sich die zweite.
          */}
          <div className="-mx-4 -mb-4 space-y-2 rounded-b-xl border-t bg-muted/50 p-4">
            {abschluss ? (
              preisModus === "retail" ? (
                <>
                  <Button asChild size="lg" className="h-12 w-full text-base">
                    <a
                      href={`/kasse/verkaeufe/${abschluss.saleId}/bon`}
                      target="_blank"
                      rel="noopener noreferrer"
                      autoFocus
                      onClick={() => neuerVorgang(true)}
                    >
                      <Printer className="size-5" aria-hidden /> Bon drucken
                    </a>
                  </Button>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => neuerVorgang(true)}
                    >
                      Ohne Bon weiter
                    </Button>
                    {abschluss.receiptUrl ? (
                      <Button asChild variant="ghost">
                        <a
                          href={abschluss.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Receipt className="size-4" aria-hidden /> Beleg als PDF
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full text-base"
                    autoFocus
                    onClick={() => neuerVorgang(true)}
                  >
                    Nächster Verkauf
                  </Button>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {abschluss.receiptUrl ? (
                      <Button asChild variant="outline">
                        <a
                          href={abschluss.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Receipt className="size-4" aria-hidden /> Beleg als PDF
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost">
                      <a
                        href={`/kasse/verkaeufe/${abschluss.saleId}/bon`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Printer className="size-4" aria-hidden /> Bon drucken
                      </a>
                    </Button>
                  </div>
                </>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Zahlartknopf({
  aktiv,
  onClick,
  icon: Icon,
  label,
}: {
  aktiv: boolean;
  onClick: () => void;
  icon: typeof Banknote;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md border-2 px-3 py-2.5 text-sm font-medium transition-colors",
        aktiv
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}
