"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BadgePlus, Copy, Loader2, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { NumericInput } from "@/components/numeric-input";
import {
  PreisschildBogenVorschau,
  type BogenPlatz,
} from "@/components/admin/preisschild-bogen-vorschau";
import { PreisschildArtikelSuche } from "@/components/admin/preisschild-artikel-suche";
import { PreisschildVorschau } from "@/components/admin/preisschild-vorschau";
import { KassenStatus, useKassenMeldung } from "@/components/pos/kassen-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProductField } from "@/lib/actions/admin-products";
import {
  legeSchildArtikelAn,
  sucheSchildArtikel,
} from "@/lib/actions/preisschilder";
import { MODUL_HART, MODUL_MIN, barcode as strichcode } from "@/lib/barcode";
import { formatPrice } from "@/lib/format";
import {
  barcodeMasse,
  formatMass,
  fussAufteilung,
  ghCode,
  proBogen,
  schildMasse,
  schildPreis,
  type LabelOption,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";
import {
  getFreiServerStand,
  getFreiStand,
  setzeFormat,
  setzeMitBarcode,
  setzeSchilder,
  subscribeFrei,
  type FreiesSchild,
} from "@/lib/preisschild-entwurf";
import { useScanFocus } from "@/lib/use-scan-focus";
import type {
  LabelIcon,
  PreisschildArtikel,
} from "@/lib/queries/preisschilder";
import type { Category } from "@/lib/types";

/**
 * Freier Preisschild-Generator mit Artikelabgleich.
 *
 * Der Generator unter /admin/preisschilder nimmt seine Angaben aus dem
 * Artikelstamm und setzt voraus, dass die Ware dort schon steht. Hier wird
 * getippt – und der Barcode entscheidet, was daraus wird:
 *
 *  - **Bekannter Code** füllt Bezeichnung, Artikelnummer und alle Preise aus
 *    dem Artikelstamm und legt das Schild **in einem Zug** aufs Blatt. Ein
 *    Scan, ein Schild: ein Handscanner schließt mit Enter ab, und zwei Enter
 *    je Artikel sind bei einem Regal voll Ware einer zu viel.
 *  - **Unbekannter Code** wird beim Ablegen zu einem neuen Artikel. Vorher
 *    entstand hier für neue Ware ein Zettel und sonst nichts: dieselben
 *    Angaben mussten danach im Artikelformular ein zweites Mal getippt
 *    werden, und bis dahin ließ sich die Ware weder scannen noch verkaufen.
 *  - **Ohne Barcode** bleibt es ein reines Schild, wie bisher – für den
 *    Aktionsstapel vor der Tür oder eine Dienstleistung an der Wand, die kein
 *    Artikel werden soll. Dann hilft die **Namenssuche** im
 *    Bezeichnungsfeld: Ware ohne lesbares Etikett steht trotzdem im Stamm.
 *
 * Geprüft wird nicht vor dem Ablegen, sondern vor dem Drucken: das Blatt ist
 * die Liste, jedes Schild steht dort in Originalmaßen, ein Klick holt es
 * zurück, und gedruckt wird erst auf Knopfdruck.
 *
 * Dieselbe Haltung wie an der Kasse und im Wareneingang: wer Ware in der Hand
 * hat, erfasst sie einmal und nicht an drei Stellen. Deshalb auch dieselben
 * Signale (`useKassenMeldung()`) und derselbe Tastatur-Wächter
 * (`useScanFocus()`) – gescannt wird hier wie dort.
 *
 * Gerechnet, gesetzt und gedruckt wird mit denselben Regeln
 * (`lib/preisschild.ts`) und über denselben Druckbogen
 * (`/admin/preisschilder/druck`) wie beim Bestandsgenerator: ein frei
 * eingegebenes Schild soll im Regal neben einem aus dem Bestand stehen, ohne
 * dass man sieht, welches woher kam.
 *
 * Arbeitsweise: scannen oder tippen, Enter – das Schild liegt auf dem Blatt.
 * Noch eins, noch eins, drucken. Kein Dialog, kein zweiter Schritt.
 */

/** Entwurfszustand des Formulars – ein Schild, das noch keine Kennung hat. */
type Entwurf = Omit<FreiesSchild, "id">;

const LEER: Entwurf = {
  name: "",
  preis: 0,
  vorher: 0,
  gh: 0,
  sku: "",
  barcode: "",
  iconId: null,
  labelKey: null,
  anzahl: 1,
  productId: null,
};

/**
 * Höchstzahl der Schilder – dieselbe Grenze wie im Druckbogen (MAX_SCHILDER
 * in der Route), hier aber schon beim Tippen wirksam, damit der Bogen nicht
 * erst beim Öffnen mit einem Fehler abbricht.
 */
const MAX_SCHILDER = 1000;

/**
 * Angaben eines Artikels in Entwurfswerte überführen.
 *
 * Getrennt von `uebernehmeArtikel()`, das dasselbe fürs Formular tut: beim
 * Ablegen wird der Wert *gerechnet*, im Formular wird er *angezeigt*, und auf
 * React-State ist beim Ablegen kein Verlass (siehe uebernehmen()).
 *
 * Der Streichpreis kommt mit, auch wenn er leer ist – sonst bliebe die
 * Reduzierung des vorigen Artikels stehen und das nächste Schild wäre
 * fälschlich rot.
 */
function alsEntwurf(artikel: PreisschildArtikel, basis: Entwurf): Entwurf {
  return {
    ...basis,
    name: artikel.name,
    sku: artikel.sku,
    barcode: artikel.barcode ?? basis.barcode,
    preis: artikel.preis ?? 0,
    vorher: artikel.vorher ?? 0,
    gh: artikel.grosshandel ?? 0,
    productId: artikel.id,
  };
}

/**
 * Schild aufs Blatt legen – oder die Stückzahl eines vorhandenen erhöhen.
 *
 * Zweimal derselbe Artikel heißt „zwei Stück", nicht „zwei Zeilen". Mit der
 * Auto-Ablage ist zweimal scannen der naheliegende Weg zu zwei Schildern;
 * zwei getrennte Zeilen ließen sich getrennt bepreisen, und das fiele erst
 * auf dem Papier auf. Dieselbe Regel wie im Bestandsgenerator und bei der
 * Mengenerfassung im Wareneingang.
 *
 * Zusammengelegt wird über die **Artikelnummer**, nicht über die Bezeichnung:
 * zwei frei getippte Schilder mit demselben Wortlaut, aber verschiedenen
 * Preisen sind zwei Schilder. Ein Schild ohne Artikelnummer wird nie
 * zusammengelegt.
 */
function legeAb(alt: FreiesSchild[], werte: Entwurf): FreiesSchild[] {
  const sku = werte.sku.trim();
  const vorhanden = sku ? alt.findIndex((e) => e.sku.trim() === sku) : -1;

  if (vorhanden >= 0) {
    return alt.map((e, i) =>
      i === vorhanden ? { ...werte, id: e.id, anzahl: e.anzahl + werte.anzahl } : e,
    );
  }
  return [...alt, { ...werte, id: `s-${Date.now()}-${alt.length}` }];
}

export function PreisschildFrei({
  icons,
  formate,
  labels,
  kategorien,
  vorgabeKategorie,
}: {
  icons: LabelIcon[];
  formate: SchildFormat[];
  labels: LabelOption[];
  /** Warengruppen für den Fall, dass aus dem Schild ein Artikel wird. */
  kategorien: Category[];
  /** Warengruppe des zuletzt angelegten Artikels – siehe getLastUsedCategoryId(). */
  vorgabeKategorie: string | null;
}) {
  /*
   * Die Liste liegt im Browser, außerhalb von React – siehe
   * lib/preisschild-entwurf.ts. Vor dem ersten Lesen ist sie leer; das ist
   * derselbe Stand, den der Server gerendert hat.
   */
  const stand = useSyncExternalStore(
    subscribeFrei,
    getFreiStand,
    getFreiServerStand,
  );
  const schilder = stand.schilder;

  const [entwurf, setEntwurf] = useState<Entwurf>(LEER);
  /** Kennung des Schilds, das gerade bearbeitet wird. null = neues Schild. */
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const scanFeld = useRef<HTMLInputElement>(null);
  const nameFeld = useRef<HTMLInputElement>(null);

  /* ---- Artikelabgleich ----------------------------------------------------
   * `aufgeloest` ist der Code, zu dem `treffer` gehört. Beides zusammen sagt
   * dreierlei: noch nicht nachgesehen (aufgeloest !== Code im Feld), bekannt
   * (treffer gesetzt) oder unbekannt (nachgesehen, nichts gefunden). Ein
   * eigenes Kennzeichen „unbekannt" wäre ein vierter Zustand, der mit den
   * anderen auseinanderlaufen kann, sobald jemand im Feld weitertippt.
   */
  const [aufgeloest, setAufgeloest] = useState<string | null>(null);
  const [treffer, setTreffer] = useState<PreisschildArtikel | null>(null);
  const [sucht, setSucht] = useState(false);
  const [legtAn, setLegtAn] = useState(false);
  /** Warengruppe und Anfangsbestand eines neu anzulegenden Artikels. */
  const [kategorieId, setKategorieId] = useState(
    () => vorgabeKategorie ?? kategorien[0]?.id ?? "",
  );
  const [bestand, setBestand] = useState(0);
  /**
   * Einkaufspreis (Migration 047) – nur fürs Haus.
   *
   * Steht außerhalb von `entwurf` und damit außerhalb des Browser-Stores:
   * er gehört an den Artikel und nicht an das Schild, und ein Stapel
   * Einkaufspreise hätte in `lib/preisschild-entwurf.ts` nichts zu suchen.
   * Aufs Papier kommt er nie – der verdeckte Code trägt weiter den
   * Großhandelspreis.
   */
  const [einkauf, setEinkauf] = useState(0);

  /**
   * Preis und Großhandelspreis, wie sie beim Treffer aus dem Stamm kamen.
   * Nur zum Vergleich, wie `einkauf`: ändert sich der Preis gegenüber diesem
   * Stand, zieht `preisSynchronisieren()`/`ghSynchronisieren()` den Artikel
   * nach, nicht nur das Schild.
   */
  const [basisPreis, setBasisPreis] = useState(0);
  const [basisGh, setBasisGh] = useState(0);

  const { meldung, melden } = useKassenMeldung();

  /*
   * Handscanner tippen blind los, egal wo der Fokus steht. Pausiert, solange
   * eine Abfrage läuft: käme der zweite Scan mitten in die Antwort des
   * ersten, stünden am Ende die Angaben des einen Artikels unter dem Code des
   * anderen.
   */
  useScanFocus(scanFeld, sucht || legtAn);

  /*
   * Der Code, der gerade im Feld steht – ohne ihn in die Abhängigkeiten der
   * Abfrage zu ziehen. Eine Antwort wird nur übernommen, wenn sie noch zu
   * diesem Code gehört: sonst überschriebe ein langsamer erster Scan die
   * Angaben des zweiten.
   */
  const codeRef = useRef("");
  useEffect(() => {
    codeRef.current = entwurf.barcode.trim();
  }, [entwurf.barcode]);

  /*
   * Vorgabe ist die mittlere Größe: die kleine trägt kaum eine Bezeichnung,
   * die große passt nur sechsmal aufs Blatt. Eine gelöschte oder unbekannte
   * Kennung darf die Seite nicht ohne Format lassen.
   */
  const vorgabe = formate[Math.min(1, formate.length - 1)];
  const format =
    formate.find((f) => f.id === stand.formatId) ?? vorgabe ?? formate[0];
  const mitBarcode = stand.mitBarcode;

  /* ---- Rechnen ----------------------------------------------------------- */

  /** Aus einem Eintrag wird ein Schild – dieselben Regeln wie im Druckbogen. */
  const alsSchild = useMemo(() => {
    return (e: Entwurf): Preisschild => {
      const { preis, vorher, prozent } = schildPreis(e.preis, e.vorher || null);
      const icon = e.iconId ? icons.find((i) => i.id === e.iconId) : null;
      const label = e.labelKey ? labels.find((l) => l.key === e.labelKey) : null;
      return {
        // Ein leeres Feld zeigt in der Vorschau, wo die Bezeichnung landet.
        // Aufs Blatt kommt ohne sie nichts, siehe uebernehmen().
        name: e.name.trim() || "Bezeichnung",
        preis,
        vorher,
        prozent,
        sku: e.sku.trim(),
        code: ghCode(e.gh),
        barcode: mitBarcode ? e.barcode.trim() || null : null,
        icon: icon?.url ?? null,
        label: label ? { name: label.name, farbe: label.farbe } : null,
      };
    };
  }, [icons, labels, mitBarcode]);

  const gesamt = schilder.reduce((summe, e) => summe + e.anzahl, 0);
  const kapazitaet = format ? proBogen(format) : 0;
  const boegen = kapazitaet > 0 ? Math.ceil(gesamt / kapazitaet) : 0;
  const frei = boegen * kapazitaet - gesamt;
  const ohnePreis = schilder.filter((e) => e.preis <= 0).length;

  /**
   * Hält der Bogen Platz für Strichcodes frei? Die Entscheidung fällt einmal
   * für das ganze Blatt – dieselbe Regel wie in buildLabelSheetHtml, sonst
   * stünde der Preis auf Schildern mit Code kleiner als auf denen ohne.
   */
  const formatTraegtCode =
    !!format && schildMasse(format, { barcode: true }).barcode > 0;
  const codePlatz =
    mitBarcode &&
    formatTraegtCode &&
    schilder.some((e) => e.barcode.trim() && strichcode(e.barcode.trim()));

  /*
   * Für die Einzelvorschau zählt der Entwurf mit: er wird gleich ein Eintrag,
   * und bis dahin soll das Schild unter dem Formular so aussehen wie danach
   * auf dem Blatt.
   */
  const codePlatzEntwurf =
    codePlatz ||
    (mitBarcode &&
      formatTraegtCode &&
      Boolean(entwurf.barcode.trim() && strichcode(entwurf.barcode.trim())));

  /** Schmalste Striche des Blattes – darunter liest sie kein Scanner mehr. */
  const striche = useMemo(() => {
    if (!codePlatz || !format) return null;
    const masse = schildMasse(format, { barcode: true });
    const werte = [...schilder.map((e) => e.barcode), entwurf.barcode]
      .map((wert) => {
        const code = strichcode(wert.trim());
        return code ? barcodeMasse(code.breite, masse).modul : null;
      })
      .filter((v): v is number => v !== null);
    return werte.length > 0 ? Math.min(...werte) : null;
  }, [codePlatz, format, schilder, entwurf.barcode]);

  /** Eingetippte Nummer, die kein EAN ist: steht als Text in der Fußzeile. */
  const keinEan =
    mitBarcode &&
    Boolean(entwurf.barcode.trim()) &&
    !strichcode(entwurf.barcode.trim());

  const reduziert = schildPreis(entwurf.preis, entwurf.vorher || null);

  /*
   * Fällt das gewählte Label weg? In der Fußzeile gilt die Rangfolge
   * Artikelnummer → Strichcode → Label (siehe fussAufteilung()), und auf einem
   * schmalen Schild mit Strichcode bleibt für das Label nichts übrig. Es
   * verschwindet dann einfach – wer „Neu" ausgewählt hat und es nirgends
   * wiederfindet, sucht sonst den Fehler bei sich.
   */
  const labelEntfaellt =
    !!format &&
    fussAufteilung(
      alsSchild(entwurf),
      schildMasse(format, { barcode: codePlatzEntwurf }),
    ).labelEntfaellt;

  /** Jeder Platz des Blattes, in der Reihenfolge der Einträge. */
  const plaetze = useMemo<BogenPlatz[]>(() => {
    const liste: BogenPlatz[] = [];
    for (const e of schilder) {
      const schild = alsSchild(e);
      for (let i = 0; i < e.anzahl; i++) {
        liste.push({ eintragId: e.id, schild });
      }
    }
    return liste;
  }, [schilder, alsSchild]);

  /* ---- Stand des Abgleichs ----------------------------------------------- */

  /** Der Code, um den es gerade geht. Leer heißt: ein Schild ohne Artikel. */
  const code = entwurf.barcode.trim();
  /** Wurde zu genau diesem Code schon nachgesehen? */
  const abgeglichen = aufgeloest !== null && aufgeloest === code;
  /** Der gefundene Artikel – nur, wenn er zum Code im Feld gehört. */
  const gefunden = abgeglichen ? treffer : null;
  /** Nachgesehen und nichts gefunden: aus dem Schild wird ein Artikel. */
  const unbekannt = Boolean(code) && abgeglichen && !treffer;

  /* ---- Bedienen ---------------------------------------------------------- */

  function feld(teil: Partial<Entwurf>) {
    setEntwurf((alt) => ({ ...alt, ...teil }));
  }

  /**
   * Zurück ins Scannerfeld – aber erst nach dem Neuzeichnen.
   *
   * Der Fokuswechsel löst das Verlassen des Feldes aus, in dem gerade getippt
   * wurde, und ein Zahlenfeld meldet beim Verlassen den Wert, der dann im DOM
   * steht (siehe components/numeric-input.tsx). Sofort gerufen wäre das die
   * eben abgelegte Stückzahl: sie stünde nach dem Zurücksetzen wieder im Feld,
   * und das nächste Schild käme ungefragt vierfach aufs Blatt.
   *
   * Ziel ist das Scannerfeld und nicht mehr die Bezeichnung: der nächste
   * Handgriff ist der nächste Artikel, und der beginnt mit einem Scan.
   */
  function zurueckZumFeld(ziel: "scan" | "name" = "scan") {
    requestAnimationFrame(() =>
      (ziel === "name" ? nameFeld : scanFeld).current?.focus(),
    );
  }

  /**
   * Angaben eines gefundenen Artikels ins Formular holen.
   *
   * Überschreibt, was im Formular steht: wer scannt, will die gepflegten
   * Angaben und nicht die halb getippten. Der Streichpreis kommt mit, auch
   * wenn er leer ist – sonst bliebe die Reduzierung des vorigen Artikels
   * stehen und das nächste Schild wäre fälschlich rot.
   */
  const uebernehmeArtikel = useCallback((artikel: PreisschildArtikel) => {
    setEntwurf((alt) => alsEntwurf(artikel, alt));
    setKategorieId(artikel.kategorieId);
    // Der Einkaufspreis des Artikels, zur Ansicht. Auf 0 zurück, wenn keiner
    // gepflegt ist – sonst stünde der des vorigen Artikels daneben und man
    // verhandelte gegen die falsche Zahl.
    setEinkauf(artikel.einkauf ?? 0);
    // Vergleichsstand für die Preisrückschreibung – derselbe Grund wie beim
    // Einkaufspreis: ohne Reset gälte der Stand des vorigen Treffers.
    setBasisPreis(artikel.preis ?? 0);
    setBasisGh(artikel.grosshandel ?? 0);
  }, []);

  /**
   * Preis beim Verlassen des Felds an den Artikel zurückschreiben.
   *
   * Nur für einen frisch gefundenen Artikel (`gefunden`, kein nachträglich
   * bearbeitetes Schild aus dem Blatt – dieselbe Grenze wie beim
   * Artikelabgleich selbst: „Abgeglichen wird nur ein neues Schild"). Wer den
   * Preis eines bekannten Artikels hier ändert, ändert meistens den
   * tatsächlichen Ladenpreis – das Schild ist das Werkzeug dafür. Ausgenommen
   * ein reduzierter Artikel (`entwurf.vorher > 0`): der Preis ist die Aktion
   * dieses Schilds, keine neue Dauerpreisangabe.
   */
  async function preisSynchronisieren(neuerPreis: number) {
    /*
     * Über productId, nicht über `gefunden`: der ist nach bearbeiten() immer
     * null (das zurückgeholte Schild wird nicht noch einmal abgeglichen),
     * aber genau dort soll eine Preisänderung ebenfalls zurückgeschrieben
     * werden – wer ein abgelegtes Schild korrigiert, korrigiert in aller
     * Regel auch den tatsächlichen Preis, nicht nur das Papier.
     */
    if (!entwurf.productId || entwurf.vorher > 0) return;
    if (neuerPreis <= 0 || neuerPreis === basisPreis) return;

    const ergebnis = await updateProductField({
      id: entwurf.productId,
      field: "retail_price",
      value: String(neuerPreis),
    });
    if (ergebnis.error) {
      melden("warnung", ergebnis.error, entwurf.sku);
      return;
    }
    setBasisPreis(neuerPreis);
    melden("treffer", `Ladenpreis aktualisiert`, entwurf.sku);
  }

  /** Dieselbe Rückschreibung für den Großhandelspreis, ohne Ausnahme für
   *  reduzierte Artikel: der verdeckte Code bleibt der tatsächliche
   *  Großhandelspreis. */
  async function ghSynchronisieren(neuerGh: number) {
    if (!entwurf.productId) return;
    if (neuerGh <= 0 || neuerGh === basisGh) return;

    const ergebnis = await updateProductField({
      id: entwurf.productId,
      field: "unit_price",
      value: String(neuerGh),
    });
    if (ergebnis.error) {
      melden("warnung", ergebnis.error, entwurf.sku);
      return;
    }
    setBasisGh(neuerGh);
    melden("treffer", `Großhandelspreis aktualisiert`, entwurf.sku);
  }

  /**
   * Code im Artikelstamm nachschlagen.
   *
   * `still` unterscheidet, wer gefragt hat: die Hintergrundabfrage nach dem
   * Tippen bleibt stumm, ein abgeschlossener Scan (Enter) und das Verlassen
   * des Feldes melden sich. Sonst piepte beim Tippen einer 13-stelligen
   * Nummer jede Tippause einmal „unbekannt".
   */
  const aufloesen = useCallback(
    async (
      code: string,
      { still = false }: { still?: boolean } = {},
    ): Promise<PreisschildArtikel | null> => {
      const sauber = code.trim();
      if (!sauber) {
        setAufgeloest(null);
        setTreffer(null);
        return null;
      }

      setSucht(true);
      try {
        const antwort = await sucheSchildArtikel(sauber);
        // Inzwischen weitergetippt? Dann gehört die Antwort nicht mehr hierher.
        if (antwort.code !== codeRef.current) return null;

        setAufgeloest(antwort.code);
        setTreffer(antwort.artikel);

        if (antwort.artikel) {
          uebernehmeArtikel(antwort.artikel);
          if (!still) {
            melden("treffer", antwort.artikel.name, antwort.artikel.sku);
          }
        } else if (!still) {
          melden(
            "unbekannt",
            "Noch kein Artikel – wird beim Ablegen angelegt.",
            sauber,
          );
        }
        return antwort.artikel;
      } catch (fehler) {
        console.error("[preisschilder] Artikelabgleich:", fehler);
        melden("fehler", "Der Artikelstamm war nicht erreichbar.", sauber);
        return null;
      } finally {
        setSucht(false);
      }
    },
    [melden, uebernehmeArtikel],
  );

  /**
   * Hintergrundabfrage beim Tippen.
   *
   * Ein Scanner schickt seinen Code in einem Rutsch, dann steht er still –
   * nach einer halben Sekunde Ruhe ist die Eingabe fertig. Ohne diese Abfrage
   * müsste man den Abgleich von Hand auslösen, und genau das soll er nicht
   * sein: er ist der Grund, warum hier gescannt wird.
   *
   * Ab sechs Zeichen, weil kürzer weder EAN-8 noch eine Artikelnummer ist –
   * jede Abfrage darunter wäre eine Antwort auf eine halb getippte Nummer.
   */
  useEffect(() => {
    const code = entwurf.barcode.trim();
    if (!code || code === aufgeloest || code.length < 6) return;
    const uhr = setTimeout(() => {
      void aufloesen(code, { still: true });
    }, 450);
    return () => clearTimeout(uhr);
  }, [entwurf.barcode, aufgeloest, aufloesen]);

  /**
   * Entwurf aufs Blatt legen – oder das bearbeitete Schild ändern.
   *
   * Ein Formular mit Absenden und nicht nur ein Knopf: die Hand bleibt auf der
   * Tastatur. Scannen, Preis prüfen, Enter, nächster Artikel – und zwar aus
   * jedem Feld heraus.
   *
   * Steht ein Barcode im Feld, führt der Weg über den Artikelstamm: bekannt
   * heißt weiter wie bisher, unbekannt heißt erst anlegen, dann drucken. Das
   * Schild und der Artikel entstehen aus denselben getippten Angaben, also
   * sollen sie auch in einem Zug entstehen.
   */
  async function uebernehmen() {
    if (sucht || legtAn) return;

    const anzahl = Math.max(1, Math.round(entwurf.anzahl));
    const alterStand = bearbeitet
      ? (schilder.find((e) => e.id === bearbeitet)?.anzahl ?? 0)
      : 0;
    if (gesamt - alterStand + anzahl > MAX_SCHILDER) {
      toast.error(`Mehr als ${MAX_SCHILDER} Schilder auf einmal gehen nicht.`);
      return;
    }

    /*
     * Die abzulegenden Werte entstehen hier und nicht aus `entwurf`.
     *
     * Bei einem Treffer fließen die Angaben des Artikels gleichzeitig über
     * setEntwurf() ins Formular – React hat den State bis zum Ende dieser
     * Funktion aber nicht aktualisiert. Aus `entwurf` gelesen käme das Schild
     * mit der alten, womöglich leeren Bezeichnung aufs Blatt.
     */
    let werte: Entwurf = { ...entwurf, anzahl };

    /*
     * Der Artikelabgleich gilt nur für neue Schilder. Wer ein Schild
     * nachträglich ändert, korrigiert das Papier – daraus einen Artikel
     * anzulegen wäre eine Nebenwirkung, mit der niemand rechnet.
     */
    if (code && !bearbeitet) {
      /*
       * Bekannter Code heißt: füllen und ablegen, in einem Zug. Ein
       * Handscanner schließt mit Enter ab; früher brauchte es deshalb zwei
       * Enter je Artikel – eines zum Nachsehen, eines zum Ablegen. Bei einem
       * Regal voll Ware ist das ein Tastendruck zu viel pro Artikel.
       *
       * Der alte Abbruch sollte verhindern, dass ein ungeprüfter Preis
       * gedruckt wird. Dieser Schutz bleibt, er wandert nur von „vor dem
       * Ablegen" nach „vor dem Drucken": jedes abgelegte Schild steht in
       * Originalmaßen auf dem Blatt, ein Klick holt es zurück, und gedruckt
       * wird erst auf Knopfdruck.
       */
      const artikel = abgeglichen
        ? treffer
        : await aufloesen(code, { still: true });

      if (artikel) {
        /*
         * Die Stammangaben übernehmen nur, wenn sie gerade eingetroffen sind.
         * War der Code schon abgeglichen, stehen sie längst im Formular –
         * womöglich mit einer Korrektur von Hand, und die soll aufs Papier.
         * Eine solche Korrektur beim Ablegen zu verwerfen wäre das Gegenteil
         * dessen, was der Treffer-Hinweis verspricht.
         */
        werte = abgeglichen
          ? { ...werte, sku: artikel.sku }
          : alsEntwurf(artikel, werte);
        melden("treffer", artikel.name, artikel.sku);
      } else {
        // Ohne Treffer entsteht ein Artikel – dafür braucht es die getippten
        // Angaben, allen voran eine Bezeichnung.
        const name = werte.name.trim();
        if (!name) {
          /*
           * Der vertraute Zweiklang für „Code ohne Treffer", nicht der
           * Warnton: es ist kein Fehler, sondern der Anfang einer Neuanlage.
           * Deshalb löst uebernehmen() stumm auf und meldet hier selbst –
           * sonst käme erst „unbekannt" und gleich darauf eine Warnung.
           */
          melden(
            "unbekannt",
            "Noch kein Artikel – Bezeichnung und Preis eintragen, dann Enter.",
            code,
          );
          zurueckZumFeld("name");
          return;
        }
        if (!kategorieId) {
          melden("warnung", "Ohne Warengruppe kein Artikel.", code);
          return;
        }

        setLegtAn(true);
        const ergebnis = await legeSchildArtikelAn({
          name,
          barcode: code,
          categoryId: kategorieId,
          retailPrice: werte.preis,
          wholesalePrice: werte.gh,
          costPrice: einkauf,
          stock: bestand,
        });
        setLegtAn(false);

        if (ergebnis.error || !ergebnis.artikel) {
          const text = ergebnis.error ?? "Der Artikel konnte nicht angelegt werden.";
          melden("fehler", text, code);
          toast.error(text);
          return;
        }

        setAufgeloest(code);
        setTreffer(ergebnis.artikel);
        melden("neu", `${ergebnis.artikel.name} angelegt`, ergebnis.artikel.sku);

        /*
         * Nur die Artikelnummer aus dem Stamm, nicht die Preise: angelegt
         * wurde eben mit den getippten Werten, und ein Rückfall (Ladenpreis
         * als Staffelpreis, wenn kein Großhandelspreis kam) soll nicht
         * plötzlich als verdeckter Code auf dem Schild stehen.
         */
        werte = {
          ...werte,
          name,
          sku: ergebnis.artikel.sku,
          productId: ergebnis.artikel.id,
        };
      }
    } else {
      // Reines Schild oder nachträgliche Änderung: die Artikelnummer ist hier
      // das, was getippt wurde, und nicht die aus einem Stamm.
      werte = { ...werte, sku: werte.sku.trim() };
    }

    /*
     * Ein Schild ohne Bezeichnung trägt nichts. Die Prüfung steht hinter dem
     * Abgleich und gilt für alle Wege: bei einem Treffer kommt die
     * Bezeichnung aus dem Stamm, ein Scan mit leerem Namensfeld ist also kein
     * Fehler – wer sie danach von Hand löscht, soll aber nicht ein leeres
     * Schild gedruckt bekommen.
     */
    const name = werte.name.trim();
    if (!name) {
      toast.warning("Ohne Bezeichnung kein Schild.");
      zurueckZumFeld("name");
      return;
    }
    werte = { ...werte, name };

    if (bearbeitet) {
      setzeSchilder((alt) =>
        alt.map((e) => (e.id === bearbeitet ? { ...werte, id: e.id } : e)),
      );
      setBearbeitet(null);
      toast.success("Schild geändert.");
    } else {
      setzeSchilder((alt) => legeAb(alt, werte));
    }

    /*
     * Zurückgesetzt werden die Angaben zur Ware, nicht die zur Serie: Symbol
     * und Label gelten meist für den ganzen Stapel, den jemand gerade tippt,
     * und sie stehen sichtbar im Formular. Bezeichnung und Preise dürfen
     * dagegen auf keinen Fall stehen bleiben – daraus würde ein falsch
     * bepreistes Schild, und das fällt erst im Regal auf.
     */
    setEntwurf((alt) => ({ ...LEER, iconId: alt.iconId, labelKey: alt.labelKey }));
    // Der Abgleich gehört zum Code im Feld: ist das Feld leer, gibt es nichts
    // mehr abzugleichen, und ein stehen gebliebener Treffer behauptete sonst,
    // das nächste Schild hinge an demselben Artikel.
    setAufgeloest(null);
    setTreffer(null);
    setBestand(0);
    setEinkauf(0);
    zurueckZumFeld();
  }

  /** Schild ins Formular holen. Ein Klick aufs Blatt landet hier. */
  function bearbeiten(id: string) {
    const eintrag = schilder.find((e) => e.id === id);
    if (!eintrag) return;
    setEntwurf({
      name: eintrag.name,
      preis: eintrag.preis,
      vorher: eintrag.vorher,
      gh: eintrag.gh,
      sku: eintrag.sku,
      barcode: eintrag.barcode,
      iconId: eintrag.iconId,
      labelKey: eintrag.labelKey,
      anzahl: eintrag.anzahl,
      productId: eintrag.productId,
    });
    setBearbeitet(id);
    // Der Einkaufspreis gehört zum Anlegen eines Artikels, nicht zum
    // Korrigieren eines Zettels – ein stehen gebliebener Wert gehörte zum
    // vorigen Vorgang.
    setEinkauf(0);
    // Vergleichsstand für preisSynchronisieren()/ghSynchronisieren(): das,
    // was auf diesem Schild gerade steht – nicht der Stand eines früheren
    // Treffers, der noch von einem ganz anderen Artikel stammen könnte.
    setBasisPreis(eintrag.preis);
    setBasisGh(eintrag.gh);
    // Ein zurückgeholtes Schild wird nicht noch einmal abgeglichen: es liegt
    // bereits auf dem Blatt, und sein Artikel – falls es einen gibt – ist
    // beim Ablegen entstanden. productId bleibt aber erhalten (oben), sonst
    // wüsste preisSynchronisieren() nicht, welcher Artikel gemeint ist.
    setAufgeloest(null);
    setTreffer(null);
    zurueckZumFeld("name");
  }

  function abbrechen() {
    setBearbeitet(null);
    setEntwurf(LEER);
    setAufgeloest(null);
    setTreffer(null);
    setBestand(0);
    setBasisPreis(0);
    setBasisGh(0);
    zurueckZumFeld();
  }

  /**
   * Als Kopie weiterverwenden: die Angaben bleiben im Formular, das Schild auf
   * dem Blatt bleibt unverändert. Zwei Schilder, die sich nur im Preis
   * unterscheiden, sind der häufigste Fall nach einer Preisrunde.
   */
  function kopieren() {
    setBearbeitet(null);
    toast.info("Angaben übernommen – ändern und aufs Blatt legen.");
    zurueckZumFeld();
  }

  function entfernen(id: string) {
    setzeSchilder((alt) => alt.filter((e) => e.id !== id));
    if (bearbeitet === id) abbrechen();
  }

  function stueckzahl(id: string, anzahl: number) {
    setzeSchilder((alt) =>
      alt.map((e) => (e.id === id ? { ...e, anzahl: Math.max(1, anzahl) } : e)),
    );
  }

  // Die Maße gehen mit, nicht die Kennung der Größe: der geöffnete Bogen soll
  // auch dann stimmen, wenn die Größe zwischenzeitlich geändert wurde.
  const bogenDaten = JSON.stringify({
    format: format
      ? { name: format.name, breite: format.breite, hoehe: format.hoehe }
      : null,
    zeilen: schilder.map((e) => {
      const schild = alsSchild(e);
      return {
        name: schild.name,
        sku: schild.sku,
        barcode: schild.barcode,
        preis: e.preis,
        vorher: e.vorher || null,
        gh: e.gh || null,
        iconId: e.iconId,
        label: schild.label,
        anzahl: e.anzahl,
      };
    }),
  });

  return (
    <div className="space-y-6">
      {/* ---- Bogen: Format, Strichcode, Stückzahl, Druck ------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border p-4">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">
            Schildgröße
          </span>
          <div className="flex flex-wrap gap-1">
            {formate.map((f) => {
              const gewaehlt = f.id === format?.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setzeFormat(f.id)}
                  aria-pressed={gewaehlt}
                  className={`rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                    gewaehlt
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="block font-medium">{f.name}</span>
                  <span
                    className={`block text-[11px] tabular ${
                      gewaehlt ? "text-brand-foreground/75" : "text-muted-foreground"
                    }`}
                  >
                    {formatMass(f)} · {proBogen(f)}/Bogen
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">
            Fußzeile
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mitBarcode}
              onChange={(event) => setzeMitBarcode(event.target.checked)}
              className="size-4 accent-brand"
            />
            Strichcode aufs Schild
          </label>
          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            {!mitBarcode ? (
              <p>Das Barcodefeld bleibt unbenutzt</p>
            ) : !formatTraegtCode ? (
              <p className="font-medium text-destructive">
                Zu klein für einen Strichcode – größeres Format wählen.
              </p>
            ) : striche !== null && striche < MODUL_HART ? (
              <p className="font-medium text-destructive">
                Kein Platz für die Striche – breiteres Format wählen oder Label
                weglassen.
              </p>
            ) : striche !== null && striche < MODUL_MIN ? (
              <p className="font-medium text-destructive">
                Striche nur {striche.toFixed(2)} mm schmal – breiteres Format
                wählen, sonst liest sie nicht jeder Scanner.
              </p>
            ) : (
              <p>EAN-13, EAN-8 und UPC-A werden gedruckt</p>
            )}
          </div>
        </div>

        <div className="text-sm">
          <p className="font-medium tabular">
            {gesamt} {gesamt === 1 ? "Schild" : "Schilder"} · {boegen}{" "}
            {boegen === 1 ? "Bogen" : "Bögen"}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {gesamt === 0
              ? `${kapazitaet} Plätze je A4-Bogen`
              : frei === 0
                ? "Bogen voll"
                : `${frei} ${frei === 1 ? "Platz" : "Plätze"} auf dem letzten Bogen frei`}
          </p>
          {ohnePreis > 0 ? (
            <p className="text-xs font-medium text-destructive">
              {ohnePreis} {ohnePreis === 1 ? "Schild hat" : "Schilder haben"}{" "}
              keinen Preis
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          {schilder.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setzeSchilder([]);
                abbrechen();
              }}
            >
              Blatt leeren
            </Button>
          ) : null}
          <form
            method="post"
            action="/admin/preisschilder/druck"
            // Eigenes Fenster: der Bogen ruft sofort den Druckdialog, und die
            // getippte Liste soll dahinter stehen bleiben.
            target="_blank"
          >
            <input type="hidden" name="bogen" value={bogenDaten} />
            <Button type="submit" disabled={gesamt === 0 || !format}>
              <Printer className="size-4" aria-hidden />
              Druckbogen öffnen
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ---- Eingabemaske ---------------------------------------------- */}
        <section className="space-y-4">
          {/* Dieselbe Leiste wie an der Kasse und im Wareneingang: fest über
              dem Feld, in Blickrichtung. Wer scannt, sieht nicht auf den
              Bildschirm – eine Meldung am Rand wäre weg, bevor jemand
              hinschaut. */}
          <KassenStatus
            meldung={meldung}
            bereitText="Barcode scannen oder Angaben tippen."
          />

          <form
            onSubmit={(event) => {
              event.preventDefault();
              uebernehmen();
            }}
            className={`space-y-3 rounded-lg border p-4 ${
              bearbeitet ? "border-brand" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {bearbeitet ? "Schild bearbeiten" : "Neues Schild"}
              </h2>
              {bearbeitet ? (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={kopieren}
                    title="Angaben als neues Schild weiterverwenden"
                  >
                    <Copy className="size-4" aria-hidden />
                    Kopie
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={abbrechen}>
                    <X className="size-4" aria-hidden />
                    Abbrechen
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Der Scan steht oben, weil er den Rest bestimmt: ein bekannter
                Code füllt das Formular, ein unbekannter macht daraus einen
                neuen Artikel. Das Feld ohne Barcode auszufüllen bleibt
                erlaubt – dann bleibt es ein reines Schild. */}
            <Feld label="Barcode scannen" htmlFor="frei-barcode">
              <div className="relative">
                <Input
                  id="frei-barcode"
                  ref={scanFeld}
                  autoFocus
                  value={entwurf.barcode}
                  onChange={(event) => feld({ barcode: event.target.value })}
                  onBlur={() => {
                    // Von Hand getippt und weggeklickt: nachsehen, bevor
                    // jemand auf den Knopf drückt.
                    if (code && code !== aufgeloest) void aufloesen(code);
                  }}
                  /*
                   * Kein Sonderfall für Enter mehr: ein Handscanner schließt
                   * mit Enter ab, und dieses Enter schickt das Formular ab.
                   * uebernehmen() schlägt den Code selbst nach und legt in
                   * einem Zug ab – ein Scan, ein Schild. Früher brauchte es
                   * hier zwei Enter je Artikel, eines zum Nachsehen und eines
                   * zum Ablegen.
                   */
                  placeholder="EAN scannen, tippen oder leer lassen"
                  maxLength={40}
                  className="h-9 pr-9 tabular"
                />
                {sucht ? (
                  <Loader2
                    className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </div>
            </Feld>

            {gefunden ? (
              <div className="space-y-1 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-[11px] text-success">
                <p>
                  <span className="font-medium">Artikel gefunden:</span>{" "}
                  <span className="tabular">{gefunden.sku}</span> · Bestand{" "}
                  <span className="tabular">{gefunden.bestand}</span>. Angaben
                  übernommen. Preis und Großhandelspreis schreiben beim
                  Verlassen des Felds in den Artikel zurück
                  {entwurf.vorher > 0
                    ? " (außer dem Preis – der gilt nur für dieses rote Aktionsschild)"
                    : ""}
                  ; Bezeichnung, Symbol und Label gelten nur für das Schild.
                </p>
                {/* Einkaufspreis als Nebeninformation – er steht auf keinem
                    Schild, aber wer gerade bepreist, will ihn wissen. */}
                {gefunden.einkauf !== null ? (
                  <p className="tabular">
                    Einkauf {formatPrice(gefunden.einkauf)} (intern, nicht auf
                    dem Schild)
                  </p>
                ) : null}
              </div>
            ) : null}

            {unbekannt ? (
              <div className="space-y-2 rounded-md border border-gold/50 bg-gold-soft px-3 py-2">
                <p className="text-[11px] font-medium text-gold">
                  Noch kein Artikel mit diesem Code. Beim Ablegen wird einer
                  angelegt – Bezeichnung, Barcode, Preise und Warengruppe
                  kommen von hier, die Artikelnummer aus dem Nummernkreis.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Feld label="Warengruppe" htmlFor="frei-kategorie">
                    <select
                      id="frei-kategorie"
                      value={kategorieId}
                      onChange={(event) => setKategorieId(event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {kategorien.map((kategorie) => (
                        <option key={kategorie.id} value={kategorie.id}>
                          {kategorie.name}
                        </option>
                      ))}
                    </select>
                  </Feld>
                  <Feld label="Anfangsbestand" htmlFor="frei-bestand">
                    <NumericInput
                      id="frei-bestand"
                      value={bestand}
                      onChange={setBestand}
                      className="h-9"
                    />
                  </Feld>
                </div>
                {/* Nur fürs Haus: der Einkaufspreis wandert an den Artikel
                    und ins Wareneingangsjournal, aber auf kein Papier. Der
                    verdeckte Code auf dem Schild bleibt der
                    Großhandelspreis. */}
                <Feld
                  label="Einkaufspreis (€) – intern, nicht aufs Schild"
                  htmlFor="frei-einkauf"
                >
                  <NumericInput
                    id="frei-einkauf"
                    dezimal
                    value={einkauf}
                    onChange={setEinkauf}
                    className="h-9"
                  />
                </Feld>
                {entwurf.gh <= 0 ? (
                  <p className="text-[11px] text-gold">
                    Ohne Großhandelspreis gilt der Ladenpreis auch als
                    Staffelpreis – sonst stünde der Artikel im Shop zum
                    Nulltarif.
                  </p>
                ) : null}
              </div>
            ) : null}

            {keinEan ? (
              <p className="text-[11px] text-muted-foreground">
                Kein EAN-13, EAN-8 oder UPC-A – die Nummer steht als Text in der
                Fußzeile. Eine falsche Prüfziffer wird nicht berichtigt.
              </p>
            ) : null}

            {/* Mit Artikelabgleich über die Bezeichnung – solange im
                Scannerfeld nichts steht, oder ein Code dort schon als
                unbekannt feststeht. Ist der Code aber gerade erst eingetippt
                und noch nicht abgeglichen, wäre ein Vorschlag eine Einladung,
                einen zweiten Artikel unter dem Code des ersten zu wählen. */}
            <Feld
              label={
                code && !unbekannt
                  ? "Bezeichnung"
                  : "Bezeichnung – oder im Bestand suchen"
              }
              htmlFor="frei-name"
            >
              <PreisschildArtikelSuche
                id="frei-name"
                feldRef={nameFeld}
                wert={entwurf.name}
                aktiv={(!code || unbekannt) && !bearbeitet}
                onChange={(name) => feld({ name })}
                onSelect={(artikel) => {
                  uebernehmeArtikel(artikel);

                  if (code && !artikel.barcode) {
                    /*
                     * Der gescannte Code gehörte zu keinem Artikel, aber die
                     * Ware schon – etwa, weil sie ohne EAN angelegt wurde
                     * (Alpalium-Lieferung ohne Barcodespalte). Jetzt ist die
                     * echte Nummer da, also wird sie nachgetragen: der
                     * nächste Scan dieses Artikels findet ihn direkt, ohne
                     * noch einmal über die Namenssuche zu müssen.
                     *
                     * Nur, wenn der Artikel noch *keinen* Barcode hat – einen
                     * vorhandenen zu überschreiben hieße, einem Artikel die
                     * Nummer eines anderen unterzuschieben.
                     */
                    void updateProductField({
                      id: artikel.id,
                      field: "barcode",
                      value: code,
                    }).then((ergebnis) => {
                      if (ergebnis.error) {
                        melden("warnung", ergebnis.error, artikel.sku);
                      }
                    });
                    feld({ barcode: code });
                    setAufgeloest(code);
                    setTreffer({ ...artikel, barcode: code });
                    melden(
                      "treffer",
                      artikel.name,
                      `${artikel.sku} · Barcode ${code} nachgetragen`,
                    );
                  } else {
                    /*
                     * Der Abgleich muss mitgesetzt werden, sonst hielte
                     * uebernehmen() den Artikel für unbekannt und legte ihn
                     * ein zweites Mal an – mit neuer Artikelnummer und einem
                     * Barcode, der schon vergeben ist.
                     */
                    setAufgeloest(artikel.barcode ?? artikel.sku);
                    setTreffer(artikel);
                    melden("treffer", artikel.name, artikel.sku);
                  }

                  if (code) {
                    /*
                     * Der Scanner hat entschieden, nicht die Tastatur: der
                     * nächste Handgriff ist der nächste Scan. Bliebe der
                     * Fokus im Preisfeld stehen, liefe der nächste gescannte
                     * Code dort hinein statt ins Scannerfeld – mit einer
                     * Ziffernfolge als "Preis" und einem Enter, das mitten in
                     * der Auswahl das halbfertige Schild abschickt. Genau das
                     * sah aus wie "alles ändert sich, Schilder gehen
                     * verloren".
                     */
                    zurueckZumFeld("scan");
                  } else {
                    // Keine Scannersitzung im Gang (Namenssuche ohne Code):
                    // weiter zum Preis, die nächste Frage ist „stimmt er
                    // noch?".
                    requestAnimationFrame(() =>
                      document.getElementById("frei-preis")?.focus(),
                    );
                  }
                }}
              />
            </Feld>

            <div className="grid grid-cols-2 gap-3">
              <Feld label="Preis (€)" htmlFor="frei-preis">
                <NumericInput
                  id="frei-preis"
                  dezimal
                  value={entwurf.preis}
                  onChange={(wert) => feld({ preis: wert })}
                  onBlur={(event) => {
                    const zahl =
                      Number(event.currentTarget.value.replace(",", ".")) || 0;
                    void preisSynchronisieren(zahl);
                  }}
                  className="h-9"
                />
              </Feld>
              <Feld label="Vorher (Streichpreis)" htmlFor="frei-vorher">
                <NumericInput
                  id="frei-vorher"
                  dezimal
                  value={entwurf.vorher}
                  onChange={(wert) => feld({ vorher: wert })}
                  className="h-9"
                />
              </Feld>
            </div>

            {/* Ob aus dem Streichpreis eine Reduzierung wird, entscheidet
                dieselbe Regel wie im Shop – und das soll beim Tippen sichtbar
                sein, nicht erst auf dem Papier. */}
            <p className="text-[11px] tabular">
              {entwurf.vorher > 0 && reduziert.prozent !== null ? (
                <span className="font-medium text-destructive">
                  Rotes Aktionsschild · −{reduziert.prozent} % gegenüber{" "}
                  {formatPrice(entwurf.vorher)}
                </span>
              ) : entwurf.vorher > 0 ? (
                <span className="text-muted-foreground">
                  Streichpreis liegt nicht über dem Preis – kein Aktionsschild.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Ein Vorher-Preis über dem Preis macht ein rotes Aktionsschild.
                </span>
              )}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Feld label="Artikelnummer" htmlFor="frei-sku">
                <Input
                  id="frei-sku"
                  value={entwurf.sku}
                  onChange={(event) => feld({ sku: event.target.value })}
                  placeholder="optional"
                  maxLength={40}
                  className="h-9 tabular"
                />
              </Feld>
              <Feld label="Großhandel (verdeckt)" htmlFor="frei-gh">
                <NumericInput
                  id="frei-gh"
                  dezimal
                  value={entwurf.gh}
                  onChange={(wert) => feld({ gh: wert })}
                  onBlur={(event) => {
                    const zahl =
                      Number(event.currentTarget.value.replace(",", ".")) || 0;
                    void ghSynchronisieren(zahl);
                  }}
                  className="h-9"
                />
              </Feld>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Feld label="Symbol" htmlFor="frei-icon">
                <select
                  id="frei-icon"
                  value={entwurf.iconId ?? ""}
                  onChange={(event) => feld({ iconId: event.target.value || null })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Ohne</option>
                  {icons.map((icon) => (
                    <option key={icon.id} value={icon.id}>
                      {icon.name}
                    </option>
                  ))}
                </select>
              </Feld>
              <Feld label="Label" htmlFor="frei-label">
                <select
                  id="frei-label"
                  value={entwurf.labelKey ?? ""}
                  onChange={(event) => feld({ labelKey: event.target.value || null })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Ohne</option>
                  {labels.map((label) => (
                    <option key={label.key} value={label.key}>
                      {label.name}
                    </option>
                  ))}
                </select>
              </Feld>
              <Feld label="Stückzahl" htmlFor="frei-anzahl">
                <div className="flex gap-1">
                  <NumericInput
                    id="frei-anzahl"
                    value={entwurf.anzahl}
                    onChange={(wert) => feld({ anzahl: Math.max(1, wert) })}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 px-2 text-xs"
                    onClick={() => feld({ anzahl: kapazitaet })}
                    title="Stückzahl auf einen vollen Bogen setzen"
                  >
                    Bogen
                  </Button>
                </div>
              </Feld>
            </div>

            {labelEntfaellt ? (
              <p className="text-[11px] font-medium text-destructive">
                Neben Artikelnummer und Strichcode bleibt für das Label kein
                Platz – es wird nicht gedruckt. Größeres Format wählen oder den
                Strichcode weglassen.
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={sucht || legtAn}>
              {legtAn ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : unbekannt && !bearbeitet ? (
                <BadgePlus className="size-4" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {bearbeitet
                ? "Änderung übernehmen"
                : legtAn
                  ? "Artikel wird angelegt …"
                  : unbekannt
                    ? "Anlegen und aufs Blatt"
                    : "Aufs Blatt legen"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Enter in jedem Feld legt das Schild aufs Blatt – ein bekannter
              Code wird dabei nachgeschlagen und gleich übernommen. Symbol und
              Label bleiben für das nächste Schild stehen, Bezeichnung und
              Preise nicht.
            </p>
          </form>

          {/* Einzelvorschau in Originalgröße: die Frage, wegen der man
              hinsieht, ist „passt die Bezeichnung?" – und die beantwortet nur
              das echte Maß. */}
          {format ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Vorschau in Originalgröße · {format.name} · {formatMass(format)}
              </p>
              <PreisschildVorschau
                schild={alsSchild(entwurf)}
                format={format}
                barcodePlatz={codePlatzEntwurf}
              />
              <p className="text-[11px] text-muted-foreground tabular">
                {entwurf.sku.trim() || "ohne Artikelnummer"}
                {ghCode(entwurf.gh) ? `#${ghCode(entwurf.gh)}` : ""}
              </p>
            </div>
          ) : null}
        </section>

        {/* ---- Das Blatt -------------------------------------------------- */}
        <section className="min-w-0 space-y-4">
          {format ? (
            <PreisschildBogenVorschau
              plaetze={plaetze}
              format={format}
              barcodePlatz={codePlatz}
              aktiv={bearbeitet}
              onWaehlen={bearbeiten}
            />
          ) : null}

          {schilder.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Noch kein Schild auf dem Blatt. Links ausfüllen und Enter drücken.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {schilder.map((e) => (
                <li
                  key={e.id}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    bearbeitet === e.id ? "bg-brand-soft" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => bearbeiten(e.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">
                      {e.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground tabular">
                      {formatPrice(e.preis)}
                      {e.vorher > 0 ? ` · vorher ${formatPrice(e.vorher)}` : ""}
                      {e.sku.trim() ? ` · ${e.sku.trim()}` : ""}
                    </span>
                  </button>
                  <div className="w-20 shrink-0">
                    <NumericInput
                      value={e.anzahl}
                      onChange={(wert) => stueckzahl(e.id, wert)}
                      aria-label={`Stückzahl von „${e.name}"`}
                      className="h-8"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => entfernen(e.id)}
                    aria-label={`„${e.name}" vom Blatt nehmen`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Beschriftetes Feld – wie in der Werkbank, damit beide Masken gleich aussehen. */
function Feld({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        className="block text-[11px] font-medium text-muted-foreground"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
