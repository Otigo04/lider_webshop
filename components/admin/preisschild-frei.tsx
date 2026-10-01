"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Copy, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { NumericInput } from "@/components/numeric-input";
import {
  PreisschildBogenVorschau,
  type BogenPlatz,
} from "@/components/admin/preisschild-bogen-vorschau";
import { PreisschildVorschau } from "@/components/admin/preisschild-vorschau";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { LabelIcon } from "@/lib/queries/preisschilder";

/**
 * Freier Preisschild-Generator.
 *
 * Der Generator unter /admin/preisschilder nimmt seine Angaben aus dem
 * Artikelstamm. Das deckt das Regal ab, aber nicht den Rest des Ladens:
 * Restposten, die nie erfasst wurden, ein Aktionsstapel vor der Tür, eine
 * Dienstleistung an der Wand. Dafür müsste man sonst einen Artikel anlegen,
 * nur um ein Stück Papier zu bekommen – und hätte danach eine Artikelnummer
 * ohne Bestand im System.
 *
 * Hier wird alles von Hand eingetippt. Gerechnet, gesetzt und gedruckt wird
 * mit denselben Regeln (`lib/preisschild.ts`) und über denselben Druckbogen
 * (`/admin/preisschilder/druck`) wie beim Bestandsgenerator: ein frei
 * eingegebenes Schild soll im Regal neben einem aus dem Bestand stehen, ohne
 * dass man sieht, welches woher kam.
 *
 * Arbeitsweise: ausfüllen, Enter – das Schild liegt auf dem Blatt. Noch eins,
 * noch eins, drucken. Kein Dialog, kein zweiter Schritt.
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
};

/**
 * Höchstzahl der Schilder – dieselbe Grenze wie im Druckbogen (MAX_SCHILDER
 * in der Route), hier aber schon beim Tippen wirksam, damit der Bogen nicht
 * erst beim Öffnen mit einem Fehler abbricht.
 */
const MAX_SCHILDER = 1000;

export function PreisschildFrei({
  icons,
  formate,
  labels,
}: {
  icons: LabelIcon[];
  formate: SchildFormat[];
  labels: LabelOption[];
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
  const nameFeld = useRef<HTMLInputElement>(null);

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

  /* ---- Bedienen ---------------------------------------------------------- */

  function feld(teil: Partial<Entwurf>) {
    setEntwurf((alt) => ({ ...alt, ...teil }));
  }

  /**
   * Zurück in die Bezeichnung – aber erst nach dem Neuzeichnen.
   *
   * Der Fokuswechsel löst das Verlassen des Feldes aus, in dem gerade getippt
   * wurde, und ein Zahlenfeld meldet beim Verlassen den Wert, der dann im DOM
   * steht (siehe components/numeric-input.tsx). Sofort gerufen wäre das die
   * eben abgelegte Stückzahl: sie stünde nach dem Zurücksetzen wieder im Feld,
   * und das nächste Schild käme ungefragt vierfach aufs Blatt.
   */
  function zurueckZumFeld() {
    requestAnimationFrame(() => nameFeld.current?.focus());
  }

  /**
   * Entwurf aufs Blatt legen – oder das bearbeitete Schild ändern.
   *
   * Ein Formular mit Absenden und nicht nur ein Knopf: die Hand bleibt auf der
   * Tastatur. Bezeichnung, Preis, Enter, nächstes Schild – und zwar aus jedem
   * Feld heraus.
   */
  function uebernehmen() {
    const name = entwurf.name.trim();
    if (!name) {
      toast.warning("Ohne Bezeichnung kein Schild.");
      zurueckZumFeld();
      return;
    }

    const anzahl = Math.max(1, Math.round(entwurf.anzahl));
    const alterStand = bearbeitet
      ? (schilder.find((e) => e.id === bearbeitet)?.anzahl ?? 0)
      : 0;
    if (gesamt - alterStand + anzahl > MAX_SCHILDER) {
      toast.error(`Mehr als ${MAX_SCHILDER} Schilder auf einmal gehen nicht.`);
      return;
    }

    const werte: Entwurf = { ...entwurf, name, anzahl };

    if (bearbeitet) {
      setzeSchilder((alt) =>
        alt.map((e) => (e.id === bearbeitet ? { ...werte, id: e.id } : e)),
      );
      setBearbeitet(null);
      toast.success("Schild geändert.");
    } else {
      setzeSchilder((alt) => [
        ...alt,
        { ...werte, id: `s-${Date.now()}-${alt.length}` },
      ]);
    }

    /*
     * Zurückgesetzt werden die Angaben zur Ware, nicht die zur Serie: Symbol
     * und Label gelten meist für den ganzen Stapel, den jemand gerade tippt,
     * und sie stehen sichtbar im Formular. Bezeichnung und Preise dürfen
     * dagegen auf keinen Fall stehen bleiben – daraus würde ein falsch
     * bepreistes Schild, und das fällt erst im Regal auf.
     */
    setEntwurf((alt) => ({ ...LEER, iconId: alt.iconId, labelKey: alt.labelKey }));
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
    });
    setBearbeitet(id);
    zurueckZumFeld();
  }

  function abbrechen() {
    setBearbeitet(null);
    setEntwurf(LEER);
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

            <Feld label="Bezeichnung" htmlFor="frei-name">
              <Input
                id="frei-name"
                ref={nameFeld}
                autoFocus
                value={entwurf.name}
                onChange={(event) => feld({ name: event.target.value })}
                placeholder="z. B. Handbesen mit Schaufel"
                maxLength={120}
                className="h-9"
              />
            </Feld>

            <div className="grid grid-cols-2 gap-3">
              <Feld label="Preis (€)" htmlFor="frei-preis">
                <NumericInput
                  id="frei-preis"
                  dezimal
                  value={entwurf.preis}
                  onChange={(wert) => feld({ preis: wert })}
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
                  className="h-9"
                />
              </Feld>
            </div>

            <Feld label="Barcode" htmlFor="frei-barcode">
              <Input
                id="frei-barcode"
                value={entwurf.barcode}
                onChange={(event) => feld({ barcode: event.target.value })}
                placeholder="EAN einscannen oder tippen"
                maxLength={40}
                className="h-9 tabular"
              />
            </Feld>
            {keinEan ? (
              <p className="text-[11px] text-muted-foreground">
                Kein EAN-13, EAN-8 oder UPC-A – die Nummer steht als Text in der
                Fußzeile. Eine falsche Prüfziffer wird nicht berichtigt.
              </p>
            ) : null}

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

            <Button type="submit" className="w-full">
              <Plus className="size-4" aria-hidden />
              {bearbeitet ? "Änderung übernehmen" : "Aufs Blatt legen"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Enter in jedem Feld legt das Schild aufs Blatt. Symbol und Label
              bleiben für das nächste Schild stehen, Bezeichnung und Preise
              nicht.
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
