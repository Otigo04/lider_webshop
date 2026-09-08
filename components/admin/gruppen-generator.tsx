"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Trash2 } from "lucide-react";
import { createGroupProducts } from "@/lib/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Category, ProductAttributeGroup } from "@/lib/types";

/**
 * Kombinationsgenerator für Artikelgruppen (Migration 033).
 *
 * Vier Ausführungen von Hand anzulegen heißt: viermal dasselbe Formular,
 * viermal dieselbe Beschreibung, und beim dritten Mal ist ein Preis vertippt.
 * Hier werden stattdessen die Merkmalswerte angekreuzt – Farbe rot und blau,
 * Watt 60 und 100 –, und daraus entsteht das Kreuzprodukt: vier Zeilen mit
 * Bezeichnung, Preis und Bestand.
 *
 * **Die Vorschau ist bearbeitbar und nicht bloß eine Ankündigung.** Ausgerechnet
 * das, was die Ausführungen unterscheidet, sind Preis und Bestand – sie hier
 * gleich einzutragen erspart, danach vier Artikel einzeln nachzupflegen. Eine
 * Zeile, die es nicht gibt (rot in 100 W wird nicht geführt), fliegt raus.
 *
 * Angelegt wird alles in einer Transaktion (`create_group_products`): jede
 * Ausführung braucht eine Nummer aus dem Nummernkreis, und ein Abbruch nach
 * der zweiten Zeile ließe zwei halbe Ausführungen und einen weitergezählten
 * Nummernkreis zurück.
 */

interface ZeilenEntwurf {
  /** Merkmalswerte dieser Kombination, ein Wert je Merkmal */
  valueIds: string[];
  /** „rot · 60 W" – der Zusatz hinter dem Gruppennamen */
  zusatz: string;
  name: string;
  barcode: string;
  ghPreis: string;
  ehPreis: string;
  listPreis: string;
  bestand: string;
  /** Aus der Vorschau gestrichen – diese Kombination gibt es nicht */
  raus: boolean;
}

/** Kreuzprodukt der angekreuzten Werte, Merkmal für Merkmal. */
function kombiniere(
  gewaehlt: { attribut: ProductAttributeGroup; werte: string[] }[],
): { valueIds: string[]; teile: string[] }[] {
  let ergebnis: { valueIds: string[]; teile: string[] }[] = [
    { valueIds: [], teile: [] },
  ];

  for (const { attribut, werte } of gewaehlt) {
    if (werte.length === 0) continue;
    const naechste: { valueIds: string[]; teile: string[] }[] = [];

    for (const bisher of ergebnis) {
      for (const wertId of werte) {
        const wert = attribut.values.find((w) => w.id === wertId);
        if (!wert) continue;
        naechste.push({
          valueIds: [...bisher.valueIds, wertId],
          teile: [...bisher.teile, wert.label],
        });
      }
    }
    ergebnis = naechste;
  }

  return ergebnis;
}

export function GruppenGenerator({
  categories,
  attributes,
  zuletztKategorieId,
  /** Gesetzt beim Nachlegen weiterer Ausführungen zu einer bestehenden Gruppe */
  gruppe,
}: {
  categories: Category[];
  attributes: ProductAttributeGroup[];
  zuletztKategorieId: string | null;
  gruppe?: { id: string; name: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  const [name, setName] = useState(gruppe?.name ?? "");
  const [beschreibung, setBeschreibung] = useState("");
  const [categoryId, setCategoryId] = useState(
    zuletztKategorieId ?? categories[0]?.id ?? "",
  );

  /** Angekreuzte Werte je Merkmal. */
  const [auswahl, setAuswahl] = useState<Record<string, string[]>>({});
  /**
   * Bearbeitete Zeilen, geschlüsselt über die Wertkombination. Nicht als
   * Liste: kreuzt jemand nach dem Tippen noch eine Farbe an, wird die
   * Vorschau neu gerechnet – über den Schlüssel finden die schon
   * eingetragenen Preise ihre Zeile wieder, statt verloren zu gehen.
   */
  const [entwuerfe, setEntwuerfe] = useState<Record<string, Partial<ZeilenEntwurf>>>(
    {},
  );

  const gepflegt = attributes.filter((attribut) => attribut.values.length > 0);

  const zeilen = useMemo<ZeilenEntwurf[]>(() => {
    const gewaehlt = gepflegt
      .map((attribut) => ({ attribut, werte: auswahl[attribut.id] ?? [] }))
      .filter((eintrag) => eintrag.werte.length > 0);

    if (gewaehlt.length === 0) return [];

    return kombiniere(gewaehlt).map((kombination) => {
      const schluessel = [...kombination.valueIds].sort().join("|");
      const entwurf = entwuerfe[schluessel] ?? {};
      const zusatz = kombination.teile.join(" · ");

      return {
        valueIds: kombination.valueIds,
        zusatz,
        // Vorbelegt aus Gruppenname plus Kombination. Die Bezeichnung steht
        // später auf Bon, Lieferschein und Rechnung – dort hilft „LED-Lampe
        // E27 rot · 60 W" mehr als der bloße Gruppenname.
        name: entwurf.name ?? `${name} ${zusatz}`.trim(),
        barcode: entwurf.barcode ?? "",
        ghPreis: entwurf.ghPreis ?? "",
        ehPreis: entwurf.ehPreis ?? "",
        listPreis: entwurf.listPreis ?? "",
        bestand: entwurf.bestand ?? "0",
        raus: entwurf.raus ?? false,
      };
    });
  }, [gepflegt, auswahl, entwuerfe, name]);

  const aktive = zeilen.filter((zeile) => !zeile.raus);

  function wertUmschalten(attributId: string, wertId: string) {
    setAuswahl((aktuell) => {
      const gesetzt = aktuell[attributId] ?? [];
      return {
        ...aktuell,
        [attributId]: gesetzt.includes(wertId)
          ? gesetzt.filter((id) => id !== wertId)
          : [...gesetzt, wertId],
      };
    });
  }

  function zeileAendern(zeile: ZeilenEntwurf, teil: Partial<ZeilenEntwurf>) {
    const schluessel = [...zeile.valueIds].sort().join("|");
    // `zeile` ist bereits der zusammengesetzte Stand aus Vorbelegung und
    // bisherigem Entwurf – der gespeicherte Entwurf gehört deshalb nicht noch
    // einmal darüber, er stünde nur zweimal in derselben Zusammenführung.
    setEntwuerfe((aktuell) => ({ ...aktuell, [schluessel]: { ...zeile, ...teil } }));
  }

  function anlegen() {
    setFehler(null);

    if (!gruppe && name.trim() === "") {
      setFehler("Die Gruppe braucht einen Namen.");
      return;
    }
    if (!categoryId) {
      setFehler("Die Warengruppe fehlt.");
      return;
    }
    if (aktive.length === 0) {
      setFehler("Kreuzen Sie mindestens einen Merkmalswert an.");
      return;
    }
    const ohnePreis = aktive.find((zeile) => zeile.ghPreis.trim() === "");
    if (ohnePreis) {
      setFehler(`Für „${ohnePreis.zusatz}“ fehlt der Großhandelspreis.`);
      return;
    }

    startTransition(async () => {
      const ergebnis = await createGroupProducts({
        groupId: gruppe?.id ?? null,
        name: name.trim(),
        description: beschreibung.trim(),
        categoryId,
        items: aktive.map((zeile) => ({
          name: zeile.name.trim(),
          barcode: zeile.barcode.trim() || null,
          valueIds: zeile.valueIds,
          unitPrice: zeile.ghPreis.trim().replace(",", "."),
          retailPrice: zeile.ehPreis.trim().replace(",", "."),
          listPrice: zeile.listPreis.trim().replace(",", "."),
          stock: zeile.bestand.trim() || "0",
        })),
      });

      if (ergebnis.error || !ergebnis.group) {
        setFehler(ergebnis.error ?? "Die Ausführungen konnten nicht angelegt werden.");
        return;
      }
      router.push(`/admin/gruppen/${ergebnis.group.id}`);
    });
  }

  if (gepflegt.length === 0) {
    return (
      <p className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        Legen Sie zuerst unter Einstellungen ein Merkmal mit Werten an – Farbe,
        Größe, Wattzahl. Ohne Merkmale gibt es nichts zu kombinieren.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------- Kopfdaten */}
      {gruppe ? null : (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gruppe-name">Name des Angebots</Label>
            <Input
              id="gruppe-name"
              value={name}
              maxLength={200}
              placeholder="z. B. LED-Lampe E27"
              onChange={(event) => setName(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Steht im Sortiment über der Auswahl. Die einzelnen Ausführungen
              bekommen ihn plus ihre Merkmale als Bezeichnung.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gruppe-kategorie">Warengruppe</Label>
            <select
              id="gruppe-kategorie"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Aus ihrem Nummernkreis kommen die Artikelnummern – für jede
              Ausführung eine eigene.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gruppe-text">Beschreibung</Label>
            <Textarea
              id="gruppe-text"
              rows={4}
              maxLength={5000}
              value={beschreibung}
              onChange={(event) => setBeschreibung(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Gilt für alle Ausführungen. Was sich unterscheidet, steht ohnehin
              in den Merkmalen.
            </p>
          </div>
        </section>
      )}

      {gruppe ? (
        <div className="space-y-2">
          <Label htmlFor="gruppe-kategorie">Warengruppe der neuen Ausführungen</Label>
          <select
            id="gruppe-kategorie"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* -------------------------------------------------------- Merkmale */}
      <section className="rounded-lg border-2 border-brand/30 bg-brand-soft/40 p-5">
        <h2 className="font-medium">Merkmale ankreuzen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jede Kombination der angekreuzten Werte wird zu einer eigenen
          Ausführung mit eigener Artikelnummer, eigenem Bestand und eigenem
          Preis.
        </p>

        <div className="mt-4 space-y-4">
          {gepflegt.map((attribut) => (
            <fieldset key={attribut.id}>
              <legend className="eyebrow text-muted-foreground">
                {attribut.name}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {attribut.values.map((wert) => {
                  const an = (auswahl[attribut.id] ?? []).includes(wert.id);
                  return (
                    <button
                      key={wert.id}
                      type="button"
                      role="checkbox"
                      aria-checked={an}
                      onClick={() => wertUmschalten(attribut.id, wert.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        an
                          ? "border-brand bg-brand font-medium text-brand-foreground"
                          : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      {attribut.kind === "color" ? (
                        <span
                          aria-hidden
                          className="size-4 shrink-0 rounded-full border border-black/20"
                          style={{ backgroundColor: wert.hex ?? "transparent" }}
                        />
                      ) : null}
                      {wert.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- Vorschau */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">
            Ausführungen
            {aktive.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular">
                {aktive.length}{" "}
                {aktive.length === 1 ? "Artikel" : "Artikel"} werden angelegt
              </span>
            ) : null}
          </h2>
        </div>

        {zeilen.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Noch nichts angekreuzt. Zwei Farben und zwei Wattzahlen ergeben vier
            Ausführungen.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Ausführung</th>
                  <th className="px-2 py-2 font-medium">Bezeichnung</th>
                  <th className="px-2 py-2 font-medium">Barcode</th>
                  <th className="px-2 py-2 text-right font-medium">GH €</th>
                  <th className="px-2 py-2 text-right font-medium">EH €</th>
                  <th className="px-2 py-2 text-right font-medium">vorher €</th>
                  <th className="px-2 py-2 text-right font-medium">Bestand</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {zeilen.map((zeile) => (
                  <tr
                    key={zeile.valueIds.join("|")}
                    className={cn(
                      "border-b border-border last:border-0",
                      zeile.raus && "opacity-40",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {zeile.zusatz}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={zeile.name}
                        maxLength={200}
                        disabled={zeile.raus}
                        aria-label={`Bezeichnung für ${zeile.zusatz}`}
                        onChange={(event) =>
                          zeileAendern(zeile, { name: event.target.value })
                        }
                        className="h-9 min-w-56"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={zeile.barcode}
                        maxLength={64}
                        disabled={zeile.raus}
                        placeholder="optional"
                        aria-label={`Barcode für ${zeile.zusatz}`}
                        onChange={(event) =>
                          zeileAendern(zeile, { barcode: event.target.value })
                        }
                        className="h-9 w-36 tabular"
                      />
                    </td>
                    <PreisZelle
                      wert={zeile.ghPreis}
                      raus={zeile.raus}
                      label={`Großhandelspreis für ${zeile.zusatz}`}
                      platzhalter="Pflicht"
                      onChange={(ghPreis) => zeileAendern(zeile, { ghPreis })}
                    />
                    <PreisZelle
                      wert={zeile.ehPreis}
                      raus={zeile.raus}
                      label={`Ladenpreis für ${zeile.zusatz}`}
                      platzhalter="optional"
                      onChange={(ehPreis) => zeileAendern(zeile, { ehPreis })}
                    />
                    <PreisZelle
                      wert={zeile.listPreis}
                      raus={zeile.raus}
                      label={`Vorher-Preis für ${zeile.zusatz}`}
                      platzhalter="optional"
                      onChange={(listPreis) => zeileAendern(zeile, { listPreis })}
                    />
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={zeile.bestand}
                        disabled={zeile.raus}
                        aria-label={`Bestand für ${zeile.zusatz}`}
                        onChange={(event) =>
                          zeileAendern(zeile, { bestand: event.target.value })
                        }
                        className="h-9 w-24 text-right tabular"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={
                          zeile.raus
                            ? "Doch anlegen"
                            : "Diese Kombination gibt es nicht"
                        }
                        aria-label={`${zeile.zusatz} ${zeile.raus ? "wieder aufnehmen" : "streichen"}`}
                        onClick={() => zeileAendern(zeile, { raus: !zeile.raus })}
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

        <p className="mt-2 text-xs text-muted-foreground">
          Fotos fehlen noch – ohne Foto steht eine Ausführung nicht im Shop
          (das gilt hier wie überall). Sie lassen sich anschließend je
          Ausführung nachtragen.
        </p>
      </section>

      {fehler ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {fehler}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        disabled={pending || aktive.length === 0}
        onClick={anlegen}
      >
        <Layers className="size-4" aria-hidden />
        {pending
          ? "Wird angelegt …"
          : `${aktive.length || ""} Ausführungen anlegen`.trim()}
      </Button>
    </div>
  );
}

function PreisZelle({
  wert,
  raus,
  label,
  platzhalter,
  onChange,
}: {
  wert: string;
  raus: boolean;
  label: string;
  platzhalter: string;
  onChange: (wert: string) => void;
}) {
  return (
    <td className="px-2 py-2">
      <Input
        type="text"
        inputMode="decimal"
        value={wert}
        disabled={raus}
        aria-label={label}
        placeholder={platzhalter}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-24 text-right tabular"
      />
    </td>
  );
}
