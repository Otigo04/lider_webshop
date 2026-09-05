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
  Plus,
  Receipt,
  ScanBarcode,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { completePosSale, lookupPosProduct } from "@/lib/actions/pos";
import type { PosProduct } from "@/lib/queries/pos";
import { PosCustomerStep, type PosCustomerChoice } from "@/components/pos/pos-customer-step";
import { PosCameraScanner } from "@/components/pos/pos-camera-scanner";
import { PosNewProductDialog } from "@/components/pos/pos-new-product-dialog";
import { PosProductSearch } from "@/components/pos/pos-product-search";
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
import { formatPrice, formatQuantity, toNumber } from "@/lib/format";
import { resolveTier } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type {
  AppUser,
  Category,
  PosCartItem,
  PosPaymentMethod,
} from "@/lib/types";

interface AbschlussInfo {
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
  vatRate,
  pricesGross,
}: {
  customers: AppUser[];
  categories: Category[];
  /** Steuersatz aus den Firmendaten – kein fester Wert im Code */
  vatRate: number;
  /** true = eingegebene Preise sind Endpreise inkl. USt. */
  pricesGross: boolean;
}) {
  const router = useRouter();

  const [kunde, setKunde] = useState<PosCustomerChoice | null>(null);
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
  const [bestaetigen, setBestaetigen] = useState(false);
  const [abschluss, setAbschluss] = useState<AbschlussInfo | null>(null);
  const [buchend, startBuchen] = useTransition();

  const scanRef = useRef<HTMLInputElement>(null);
  // Spiegel des Bons für Prüfungen außerhalb des Renderns (siehe aufDenBon).
  const bonRef = useRef(bon);
  useEffect(() => {
    bonRef.current = bon;
  }, [bon]);
  // Gleiches Muster für den Kamerazustand: scanVerarbeiten läuft asynchron und
  // darf nicht auf einen veralteten Wert aus seinem Abschluss zurückgreifen.
  const kameraRef = useRef(kamera);
  useEffect(() => {
    kameraRef.current = kamera;
  }, [kamera]);
  const dialogOffen =
    neuDialog.offen || bestaetigen || kamera || abschluss !== null;

  /**
   * Tastatur-Wächter: Der Scanner tippt blind los, egal wo der Fokus steht.
   * Landet ein Zeichen außerhalb eines Eingabefelds, holen wir den Fokus ins
   * Scannerfeld zurück – die Ziffer geht dabei nicht verloren, weil das
   * Ereignis erst danach am neuen Ziel ankommt.
   */
  useEffect(() => {
    if (dialogOffen) return;

    function beiTaste(event: KeyboardEvent) {
      const ziel = event.target as HTMLElement | null;
      if (
        ziel &&
        (ziel.tagName === "INPUT" ||
          ziel.tagName === "TEXTAREA" ||
          ziel.tagName === "SELECT" ||
          ziel.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      scanRef.current?.focus();
    }

    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [dialogOffen]);

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
   */
  const aufDenBon = useCallback((product: PosProduct, menge = 1) => {
    const aktuell = bonRef.current;
    const index = aktuell.findIndex((zeile) => zeile.productId === product.id);
    const neueMenge = (index >= 0 ? aktuell[index].quantity : 0) + menge;

    if (product.freeStock <= 0) {
      toast.error(`„${product.name}" ist nicht mehr am Lager.`);
      return false;
    }
    if (neueMenge > product.freeStock) {
      toast.error(
        `Von „${product.name}" sind nur noch ${formatQuantity(product.freeStock)} Stück verfügbar.`,
      );
      return false;
    }

    // Staffelpreis: an der Kasse gilt dieselbe Preisliste wie im Shop.
    const staffel = resolveTier(product.variants, neueMenge);
    const preis = staffel ? toNumber(staffel.unit_price) : (product.unitPrice ?? 0);

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
  }, []);

  async function scanVerarbeiten(code: string) {
    const gesucht = code.trim();
    if (!gesucht) return;

    setSuchend(true);
    try {
      const { product } = await lookupPosProduct(gesucht);
      if (product) {
        aufDenBon(product);
        toast.success(`${product.name} hinzugefügt.`);
      } else {
        // Kein Treffer ist der Regelfall bei neuer Ware, kein Fehler.
        // Kam der Code aus der Kamera, muss deren Fenster weichen: zwei
        // Dialoge übereinander wären nicht bedienbar.
        setKamera(false);
        setNeuDialog({ offen: true, code: gesucht });
      }
    } catch (fehler) {
      console.error("[kasse] Scan:", fehler);
      toast.error("Der Artikel konnte nicht nachgeschlagen werden.");
    } finally {
      setSuchend(false);
      setScan("");
      // Nicht zurück ins Scannerfeld greifen, solange ein Fenster offen ist –
      // das würde dessen Fokusführung stören.
      if (!kameraRef.current) scanRef.current?.focus();
    }
  }

  function mengeAendern(index: number, delta: number) {
    const zeile = bon[index];
    if (!zeile) return;

    const neu = zeile.quantity + delta;
    if (neu <= 0) {
      entfernen(index);
      return;
    }
    if (zeile.maxStock !== null && neu > zeile.maxStock) {
      toast.error(
        `Von „${zeile.name}" sind nur noch ${formatQuantity(zeile.maxStock)} Stück verfügbar.`,
      );
      return;
    }

    // Preis neu auflösen: eine größere Menge kann in die nächste Staffel fallen.
    setBon(bon.map((z, i) => (i === index ? { ...z, quantity: neu } : z)));
  }

  function preisAendern(index: number, wert: string) {
    const zahl = Number(wert.replace(",", "."));
    setBon((aktuell) =>
      aktuell.map((zeile, i) =>
        i === index
          ? { ...zeile, unitPrice: Number.isFinite(zahl) && zahl >= 0 ? zahl : 0 }
          : zeile,
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
        toast.error(ergebnis.error ?? "Der Verkauf konnte nicht gebucht werden.");
        setBestaetigen(false);
        return;
      }

      setBestaetigen(false);
      setAbschluss({
        receiptNumber: ergebnis.sale.receiptNumber,
        totalAmount: ergebnis.sale.totalAmount,
        receiptUrl: ergebnis.sale.receiptUrl,
      });
      toast.success(
        `Verkauf ${ergebnis.sale.receiptNumber} gebucht, Bestand aktualisiert.`,
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
    return <PosCustomerStep customers={customers} onWeiter={setKunde} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kasse</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="size-4" aria-hidden />
            {kunde.label}
            {kunde.customerId ? null : " · ohne Kundenkonto"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/sales">
              <Receipt className="size-4" aria-hidden /> Verkäufe
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => neuerVorgang(false)}>
            Kunde wechseln
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
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
            {/* Ersatzweg, wenn der Handscanner streikt: die Kamera des
                Rechners übernimmt das Ablesen. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setKamera(true)}
            >
              <Camera className="size-4" aria-hidden />
              Kamera statt Scanner
            </Button>
          </div>
          <div className="relative mt-2">
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
              fehlt oder nicht lesbar ist. */}
          <div className="mt-6">
            <PosProductSearch
              onSelect={(product) => {
                if (aufDenBon(product)) {
                  toast.success(`${product.name} hinzugefügt.`);
                }
              }}
            />
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
                      <p className="code text-xs text-muted-foreground">
                        {zeile.sku}
                        {zeile.barcode ? ` · ${zeile.barcode}` : ""}
                      </p>
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
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Stückpreis von ${zeile.name}`}
                        value={zeile.unitPrice}
                        onChange={(event) => preisAendern(index, event.target.value)}
                        className="h-9 text-right tabular"
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
        <aside className="rounded-lg border-2 border-brand/30 bg-card lg:sticky lg:top-24">
          <div className="border-b border-border bg-brand-soft px-5 py-3">
            <p className="text-sm font-semibold text-brand">Abrechnung</p>
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
              <dd className="text-2xl font-bold tabular text-brand">
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

      {/* Nur eingebaut, solange gescannt wird – so gibt die Komponente beim
          Schließen die Kamera wieder frei. */}
      {kamera ? (
        <PosCameraScanner
          onClose={() => setKamera(false)}
          onCode={(code) => {
            void scanVerarbeiten(code);
          }}
        />
      ) : null}

      <PosNewProductDialog
        key={neuDialog.code}
        open={neuDialog.offen}
        onOpenChange={(offen) => setNeuDialog((d) => ({ ...d, offen }))}
        barcode={neuDialog.code}
        categories={categories}
        onCreated={(product) => {
          aufDenBon(product);
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
            <DialogTitle>Verkauf {abschluss?.receiptNumber} gebucht</DialogTitle>
            <DialogDescription>
              {abschluss ? formatPrice(abschluss.totalAmount) : ""} ·{" "}
              {abschluss?.receiptUrl
                ? "Der Beleg steht als PDF bereit."
                : "Der Beleg konnte nicht erzeugt werden – er lässt sich unter „Verkäufe“ nachholen."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {abschluss?.receiptUrl ? (
              <Button asChild variant="outline">
                <a
                  href={abschluss.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Receipt className="size-4" aria-hidden /> Beleg öffnen
                </a>
              </Button>
            ) : null}
            <Button type="button" onClick={() => neuerVorgang(true)}>
              Nächster Verkauf
            </Button>
          </DialogFooter>
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
