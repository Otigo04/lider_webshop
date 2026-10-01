"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  PackagePlus,
  Plus,
  Printer,
  ScanBarcode,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { updateProductField } from "@/lib/actions/admin-products";
import { lookupEan, uebernehmeArtikelbild } from "@/lib/actions/ean";
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
  /**
   * Vorher-Preis (products.list_price) für Ware, die gleich reduziert ins
   * Regal kommt. Leer = unverändert. Bezug ist der Ladenpreis.
   */
  vorher: string;
  bestand: number | null;
  aktuellGh: number | null;
  aktuellEh: number | null;
  /**
   * Merkmalswerte für neu anzulegende Artikel (Migration 032). Bei bekannter
   * Ware bleibt das Feld leer: ein Wareneingang bucht Menge und Preis, er
   * ist nicht der Ort, an dem Stammdaten überarbeitet werden.
   */
  merkmale: string[];
  /**
   * Produktfoto aus dem Barcode-Nachschlag (lib/ean-lookup.ts). Wird nach dem
   * Buchen an den neuen Artikel gehängt; null = keins gefunden oder abgewählt.
   */
  bildUrl: string | null;
  /** Woher die vorgeschlagene Bezeichnung stammt */
  quelle: string | null;
  /** Der Nachschlag läuft noch – die Bezeichnung kann gleich von selbst kommen */
  schlaegtNach: boolean;
}

/** Was nach dem Buchen stehen bleibt: der Weg zu den Schildern der Lieferung. */
interface Gebucht {
  /** created_at der Journalzeilen – eine Buchung, ein Zeitpunkt */
  zeitpunkt: string;
  positionen: number;
  bilder: number;
}

/**
 * Preisfelder nehmen nur, was ein Preis sein kann. Sonst landet eine am
 * falschen Ort getippte Bezeichnung im Preis und fällt erst beim Buchen auf.
 */
function nurPreis(roh: string): string {
  return roh.replace(/[^0-9.,]/g, "");
}

/**
 * Cursor in ein Feld, Inhalt markiert: was dann getippt wird, ersetzt den
 * alten Wert. Ohne Markierung hängt sich die neue Zahl hinten an – aus 2 und
 * getippten 2,50 wird 22,50.
 */
function fokus(id: string) {
  const feld = document.getElementById(id);
  if (!(feld instanceof HTMLInputElement)) return;
  feld.focus();
  feld.select();
}

/** Unter diesem Schlüssel liegt die laufende Aufnahme im Browser. */
const ENTWURF = "lider_wareneingang_entwurf";

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
  const [gebucht, setGebucht] = useState<Gebucht | null>(null);

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
  /** Dasselbe für die Preisfelder, siehe preisTaste. */
  const preisVorher = useRef("");

  /*
   * Entwurf im Browser. Eine Erstaufnahme läuft über Stunden; ein F5, ein
   * zugeklapptes Notebook oder ein Absturz dürfen die Liste nicht kosten.
   * Gelesen wird einmal nach dem Einhängen (der Server kennt localStorage
   * nicht), geschrieben erst danach – sonst überschriebe die leere
   * Anfangsliste den Entwurf, bevor er gelesen ist.
   */
  const [entwurfGelesen, setEntwurfGelesen] = useState(false);
  useEffect(() => {
    // Nach dem Effekt statt darin: der Entwurf ist ein Zustand von außen,
    // kein Folgezustand dieses Renderns. Bewusst kein requestAnimationFrame –
    // das läuft in einem verdeckten Fenster gar nicht.
    const bild = setTimeout(() => {
      try {
        const roh = localStorage.getItem(ENTWURF);
        const entwurf = roh
          ? (JSON.parse(roh) as { zeilen?: Zeile[]; notiz?: string })
          : null;
        if (entwurf?.zeilen?.length) {
          setZeilen(
            entwurf.zeilen.map((zeile) => ({
              ...zeile,
              // Entwürfe von vor der Spalte „Vorher" kennen das Feld nicht.
              vorher: zeile.vorher ?? "",
              schlaegtNach: false,
            })),
          );
          setNotiz(entwurf.notiz ?? "");
        }
      } catch {
        // Unlesbarer Entwurf ist kein Entwurf.
      }
      setEntwurfGelesen(true);
    }, 0);
    return () => clearTimeout(bild);
  }, []);
  useEffect(() => {
    if (!entwurfGelesen) return;
    try {
      if (zeilen.length === 0 && notiz === "") localStorage.removeItem(ENTWURF);
      else localStorage.setItem(ENTWURF, JSON.stringify({ zeilen, notiz }));
    } catch {
      // Privates Fenster oder voller Speicher: dann eben ohne Netz.
    }
  }, [entwurfGelesen, zeilen, notiz]);

  // Getippte Zeichen außerhalb eines Feldes gehören dem Scanner.
  useScanFocus(scanRef);

  /*
   * Fokuswunsch: das Feld, in das der Cursor als Nächstes soll. Eingelöst
   * wird er nach dem Rendern – das Feld einer eben angelegten Zeile gibt es
   * vorher nicht. Ein requestAnimationFrame riet hier nur, wann React fertig
   * ist, und läuft in einem verdeckten Fenster gar nicht.
   */
  const fokusWunsch = useRef<string | null>(null);
  useEffect(() => {
    const id = fokusWunsch.current;
    if (!id) return;
    const feld = document.getElementById(id);
    if (!(feld instanceof HTMLInputElement)) return;
    fokusWunsch.current = null;
    feld.focus();
    feld.select();
  });

  /** Fokus in das Mengenfeld einer Zeile, Inhalt markiert. */
  const mengeFokussieren = useCallback((key: string) => {
    fokusWunsch.current = `menge-${key}`;
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
          vorher: "",
          bestand: product.freeStock,
          aktuellGh: product.unitPrice,
          aktuellEh: product.retailPrice,
          merkmale: [],
          bildUrl: null,
          quelle: null,
          schlaegtNach: false,
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
          vorher: "",
          bestand: null,
          aktuellGh: null,
          aktuellEh: null,
          merkmale: [],
          bildUrl: null,
          quelle: null,
          schlaegtNach: barcode !== null,
        },
      ]);
      fokusWunsch.current = `name-${key}`;
      return key;
    },
    [categories, zuletztKategorieId],
  );

  /**
   * Unbekannten Code in den Produktdatenbanken nachschlagen und die Zeile
   * füllen. Läuft neben dem Scanner her und hält ihn nicht auf: wer schneller
   * tippt als die Antwort kommt, behält, was er getippt hat.
   */
  const nachschlagen = useCallback(
    async (key: string, code: string) => {
      const treffer = await lookupEan(code).catch(() => null);

      // Die Zeile kann inzwischen gelöscht oder von Hand benannt sein.
      const zeile = zeilenRef.current.find((z) => z.key === key);
      if (!zeile) return;
      const frei = zeile.name.trim() === "";

      // Steht der Cursor noch wartend in der Bezeichnung (oder untätig im
      // Scannerfeld), geht er weiter zum Preis: das ist das Einzige, was
      // jetzt noch fehlt. Wer inzwischen woanders tippt, wird nicht gestört.
      const aktiv = document.activeElement;
      const wartet =
        aktiv?.id === `name-${key}` ||
        aktiv === document.body ||
        (aktiv === scanRef.current && scanRef.current?.value === "");
      if (treffer && frei && wartet) fokusWunsch.current = `gh-${key}`;

      setZeilen((aktuell) =>
        aktuell.map((z) =>
          z.key === key
            ? {
                ...z,
                schlaegtNach: false,
                name: treffer && z.name.trim() === "" ? treffer.name : z.name,
                bildUrl: treffer?.bildUrl ?? null,
                quelle: treffer && z.name.trim() === "" ? treffer.quelle : null,
              }
            : z,
        ),
      );

      if (!treffer) {
        if (frei) melden("unbekannt", "Nicht erkannt – Bezeichnung eintragen.", code);
        return;
      }
      if (frei) {
        // „treffer", nicht „neu": angelegt ist noch nichts, erkannt schon.
        melden("treffer", treffer.name, `erkannt über ${treffer.quelle} – Preis eintragen`);
      }
    },
    [melden],
  );

  const scanVerarbeiten = useCallback(
    async (code: string) => {
      const gesucht = code.trim();
      if (!gesucht) return;

      // Neue Ware, die schon in der Liste steht: zweiter Scan heißt „noch
      // eins". Eine zweite Neuanlage mit demselben Barcode ließe die ganze
      // Buchung scheitern.
      const schonNeu = zeilenRef.current.find(
        (zeile) => zeile.productId === null && zeile.barcode === gesucht,
      );
      if (schonNeu) {
        setZeilen((aktuell) =>
          aktuell.map((zeile) =>
            zeile.key === schonNeu.key ? { ...zeile, menge: zeile.menge + 1 } : zeile,
          ),
        );
        melden(
          "treffer",
          `${schonNeu.name || "Neue Ware"} · ${formatQuantity(schonNeu.menge + 1)} Stück`,
          gesucht,
        );
        setScan("");
        return;
      }

      setSuchend(true);
      try {
        const { product } = await lookupPosProduct(gesucht);
        if (product) {
          aufnehmen(product);
        } else {
          // Kein Treffer ist beim Wareneingang der Regelfall, kein Fehler:
          // neue Ware hat noch keinen Artikelstamm.
          const key = neueZeile(gesucht);
          melden("unbekannt", "Neue Ware – Bezeichnung wird gesucht …", gesucht);
          void nachschlagen(key, gesucht);
        }
      } catch (fehler) {
        console.error("[wareneingang] Scan:", fehler);
        melden("fehler", "Der Artikel konnte nicht nachgeschlagen werden.", gesucht);
      } finally {
        setSuchend(false);
        setScan("");
      }
    },
    [aufnehmen, neueZeile, melden, nachschlagen],
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

  /** Preis der Zeile darüber – Vorschlag für leere Preisfelder neuer Artikel. */
  function wieOben(zeile: Zeile, feld: "ghPreis" | "ehPreis"): string {
    if (zeile.productId !== null) return "";
    const index = zeilen.findIndex((z) => z.key === zeile.key);
    return index > 0 ? zeilen[index - 1][feld].trim() : "";
  }

  /**
   * Enter in einem Preisfeld führt weiter: Großhandel → Laden → Scanner. So
   * geht eine Neuanlage ohne Mausgriff durch. Der Vorher-Preis liegt nicht
   * auf dem Weg – reduziert ist die Ausnahme, er ist per Tab erreichbar. Ein Barcode im Preisfeld ist wie
   * im Mengenfeld ein Scan an der falschen Stelle.
   */
  function preisTaste(
    event: React.KeyboardEvent<HTMLInputElement>,
    zeile: Zeile,
    feld: "ghPreis" | "ehPreis" | "vorher",
  ) {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const roh = event.currentTarget.value.trim();
    if (/^[0-9]+$/.test(roh) && roh.length >= BARCODE_AB_STELLEN) {
      aendern(zeile.key, { [feld]: preisVorher.current });
      scanRef.current?.focus();
      void scanVerarbeiten(roh);
      return;
    }

    // Leeres Preisfeld einer Neuanlage: Preis der Zeile darüber. Ein Karton
    // gleich bepreister Ware ist damit Scan, Enter, Enter.
    if (feld !== "vorher" && roh === "") {
      const oben = wieOben(zeile, feld);
      if (oben) aendern(zeile.key, { [feld]: oben });
    }

    if (feld === "ghPreis") {
      fokus(`eh-${zeile.key}`);
    } else {
      scanRef.current?.focus();
    }
  }

  /** Eingabe als Zahl; null bei leerem oder unlesbarem Feld. */
  function zahl(roh: string): number | null {
    if (roh.trim() === "") return null;
    const wert = Number(roh.trim().replace(",", "."));
    return Number.isFinite(wert) ? wert : null;
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
      fokus(`gh-${ohnePreis.key}`);
      return;
    }

    /*
     * Ein Vorher-Preis ist nur mit Ladenpreis eine Reduzierung, und nur wenn
     * er darüber liegt (reduzierung() in lib/pricing.ts). Hier geprüft statt
     * still geschluckt: sonst käme ein weißes Schild aus dem Drucker, und
     * niemand wüsste, warum es nicht rot ist.
     */
    const vorherFalsch = zeilen.find((zeile) => {
      const vorher = zahl(zeile.vorher);
      if (vorher === null) return false;
      const laden = zahl(zeile.ehPreis) ?? zeile.aktuellEh;
      return laden === null || vorher <= laden;
    });
    if (vorherFalsch) {
      melden(
        "warnung",
        `„${vorherFalsch.name}": der Vorher-Preis braucht einen Ladenpreis und muss darüber liegen.`,
      );
      fokus(`vorher-${vorherFalsch.key}`);
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

      // Vorher-Preise nachtragen – wie die Merkmale kein Teil der
      // Bestandsbuchung, und aus demselben Grund kein Anlass, sie zu kippen.
      await Promise.all(
        zeilen.map(async (zeile, index) => {
          if (zahl(zeile.vorher) === null) return;
          const productId = ergebnis.entries?.[index]?.product_id;
          if (!productId) return;
          const antwort = await updateProductField({
            id: productId,
            field: "list_price",
            value: zeile.vorher.trim().replace(",", "."),
          });
          if (antwort.error) console.error("[wareneingang] Vorher-Preis:", antwort.error);
        }),
      );

      /*
       * Gefundene Produktfotos an die neuen Artikel hängen. Erst jetzt, weil
       * es den Artikel vorher nicht gab – und in kleinen Schüben, damit bei
       * zweihundert Zeilen nicht zweihundert Downloads gleichzeitig laufen.
       * Auch hier gilt: scheitert ein Bild, bleibt die Lieferung gebucht.
       */
      const mitBild = zeilen.flatMap((zeile, index) => {
        const productId = ergebnis.entries?.[index]?.product_id;
        return zeile.productId === null && zeile.bildUrl && zeile.barcode && productId
          ? [{ productId, barcode: zeile.barcode }]
          : [];
      });
      let bilder = 0;
      for (let i = 0; i < mitBild.length; i += 4) {
        const schub = await Promise.all(
          mitBild.slice(i, i + 4).map((eintrag) =>
            uebernehmeArtikelbild(eintrag).catch(() => ({ ok: false })),
          ),
        );
        bilder += schub.filter((antwort) => antwort.ok).length;
      }

      setGebucht({
        zeitpunkt: ergebnis.entries[0].created_at,
        positionen: ergebnis.entries.length,
        bilder,
      });

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
          Neuanlage – Bezeichnung und Foto werden dabei über den Barcode
          gesucht. Enter führt weiter: Bezeichnung → Großhandelspreis →
          Ladenpreis → zurück zum Scanner. Enter im leeren Preisfeld übernimmt
          den Preis der Zeile darüber. „Vorher“ nur bei reduzierter Ware
          ausfüllen (per Tab) – das Preisschild wird dann rot. Die Liste
          bleibt auch nach dem Neuladen der Seite erhalten.
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

      {gebucht && zeilen.length === 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <p className="tabular">
            {formatQuantity(gebucht.positionen)}{" "}
            {gebucht.positionen === 1 ? "Position" : "Positionen"} gebucht
            {gebucht.bilder > 0
              ? ` · ${formatQuantity(gebucht.bilder)} ${
                  gebucht.bilder === 1 ? "Foto" : "Fotos"
                } übernommen`
              : ""}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/admin/preisschilder?eingang=${encodeURIComponent(gebucht.zeitpunkt)}`}
            >
              <Printer className="size-4" aria-hidden />
              Preisschilder für diese Lieferung
            </Link>
          </Button>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ Liste */}
      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2.5 text-sm font-medium">
          <span className="flex items-center gap-3">
            Aufnahme
            {zeilen.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Die ganze Aufnahme verwerfen?")) return;
                  setZeilen([]);
                  scanRef.current?.focus();
                }}
                className="text-xs font-normal text-muted-foreground underline hover:text-destructive"
              >
                verwerfen
              </button>
            ) : null}
          </span>
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
                  <th
                    className="px-2 py-2 text-right font-medium"
                    title="Streichpreis für reduzierte Ware – macht das Preisschild rot"
                  >
                    Vorher €
                  </th>
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
                          <div className="flex items-start gap-2">
                            {zeile.bildUrl ? (
                              <span className="relative shrink-0">
                                {/* Fremde Adresse, nur Vorschau – next/image
                                    lädt ausschließlich aus dem eigenen Bucket. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={zeile.bildUrl}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="size-9 rounded border border-border bg-card object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() => aendern(zeile.key, { bildUrl: null })}
                                  aria-label="Gefundenes Foto nicht übernehmen"
                                  title="Foto nicht übernehmen"
                                  className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-card p-px text-muted-foreground hover:text-destructive"
                                >
                                  <X className="size-3" aria-hidden />
                                </button>
                              </span>
                            ) : null}
                            <Input
                              id={`name-${zeile.key}`}
                              value={zeile.name}
                              maxLength={200}
                              placeholder={
                                zeile.schlaegtNach ? "wird gesucht …" : "Bezeichnung"
                              }
                              onChange={(event) =>
                                aendern(zeile.key, {
                                  name: event.target.value,
                                  quelle: null,
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                fokus(`gh-${zeile.key}`);
                              }}
                              className="h-9 min-w-56"
                            />
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gold">
                            {zeile.schlaegtNach ? (
                              <Loader2 className="size-3 animate-spin" aria-hidden />
                            ) : (
                              <Sparkles className="size-3" aria-hidden />
                            )}
                            neuer Artikel
                            {zeile.barcode ? (
                              <span className="code text-muted-foreground">
                                · {zeile.barcode}
                              </span>
                            ) : null}
                            {zeile.quelle ? (
                              <span className="text-muted-foreground">
                                · Vorschlag von {zeile.quelle}, bitte prüfen
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
                            : wieOben(zeile, "ghPreis") || "Preis"
                        }
                        onChange={(event) =>
                          aendern(zeile.key, { ghPreis: nurPreis(event.target.value) })
                        }
                        onFocus={() => {
                          preisVorher.current = zeile.ghPreis;
                        }}
                        onKeyDown={(event) => preisTaste(event, zeile, "ghPreis")}
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
                            : wieOben(zeile, "ehPreis") || "Laden"
                        }
                        onChange={(event) =>
                          aendern(zeile.key, { ehPreis: nurPreis(event.target.value) })
                        }
                        onFocus={() => {
                          preisVorher.current = zeile.ehPreis;
                        }}
                        onKeyDown={(event) => preisTaste(event, zeile, "ehPreis")}
                        className="h-9 w-24 text-right tabular"
                      />
                    </td>

                    <td className="px-2 py-2.5">
                      <Input
                        id={`vorher-${zeile.key}`}
                        type="text"
                        inputMode="decimal"
                        value={zeile.vorher}
                        aria-label="Vorher-Preis (Streichpreis)"
                        placeholder="–"
                        onChange={(event) =>
                          aendern(zeile.key, { vorher: nurPreis(event.target.value) })
                        }
                        onFocus={() => {
                          preisVorher.current = zeile.vorher;
                        }}
                        onKeyDown={(event) => preisTaste(event, zeile, "vorher")}
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
