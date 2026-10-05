"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Printer, X } from "lucide-react";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SCHILDER } from "@/lib/preisschild-entwurf";
import {
  VORLAGEN,
  VORLAGEN_FARBEN,
  istHexFarbe,
  vorlagenLayout,
  type Vorlage,
  type VorlagenStil,
} from "@/lib/preisschild-vorlagen";
import { formatMass, proBogen, type SchildFormat } from "@/lib/preisschild";
import { cn } from "@/lib/utils";

/**
 * Vorlagen-Schilder ohne Preis.
 *
 * Gezeichnet über `vorlagenLayout()` in Originalgröße (Millimeter), dieselbe
 * Rechnung wie im Druckbogen. Der Stapel liegt im Speicher der Seite: eine
 * Vorlage ist mit einem Klick wieder da, ein Speichern lohnt nicht.
 */

interface StapelEintrag extends Vorlage {
  key: string;
  anzahl: number;
}

const LEER_EIGEN: Vorlage = {
  text: "",
  zusatz: "",
  farbe: VORLAGEN_FARBEN[1].farbe,
  stil: "flaeche",
};

function VorlagenSchild({ vorlage, format }: { vorlage: Vorlage; format: SchildFormat }) {
  const l = vorlagenLayout(vorlage, format);
  return (
    <div
      className="relative flex shrink-0 flex-col items-center justify-center overflow-hidden text-center"
      style={{
        width: `${format.breite}mm`,
        height: `${format.hoehe}mm`,
        background: l.hintergrund,
        color: l.schrift,
        padding: `${l.luft}mm`,
        border: l.rahmen > 0 ? `${l.rahmen}mm solid ${l.strich}` : undefined,
        boxSizing: "border-box",
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {l.linieAbstand > 0 ? (
        <div
          className="pointer-events-none absolute opacity-60"
          style={{
            inset: `${l.linieAbstand}mm`,
            border: `${l.linie}mm solid ${l.strich}`,
          }}
        />
      ) : null}
      <div
        style={{
          fontSize: `${l.groesse}mm`,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          transform: "translateY(-0.035em)",
        }}
      >
        {l.zeilen.map((z, i) => (
          <span key={i} className="block">
            {z}
          </span>
        ))}
      </div>
      {l.zusatzZeilen.length > 0 ? (
        <div
          style={{
            fontSize: `${l.zusatzGroesse}mm`,
            marginTop: `${l.zusatzAbstand}mm`,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "0.03em",
            whiteSpace: "nowrap",
          }}
        >
          {l.zusatzZeilen.map((z, i) => (
            <span key={i} className="block">
              {z}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PreisschildVorlagen({ formate }: { formate: SchildFormat[] }) {
  const [formatId, setFormatId] = useState(
    (formate.find((f) => f.id === "standard-mittel") ?? formate[0])?.id ?? "",
  );
  const format = formate.find((f) => f.id === formatId) ?? formate[0];

  const [stapel, setStapel] = useState<StapelEintrag[]>([]);
  const [eigen, setEigen] = useState<Vorlage>(LEER_EIGEN);

  const gesamt = stapel.reduce((s, e) => s + e.anzahl, 0);
  const bogen = format ? Math.ceil(gesamt / proBogen(format)) : 0;

  function ablegen(v: Vorlage) {
    setStapel((alt) => {
      const gleich = alt.find(
        (e) =>
          e.text === v.text &&
          e.zusatz === v.zusatz &&
          e.farbe === v.farbe &&
          e.stil === v.stil,
      );
      if (gleich) {
        return alt.map((e) =>
          e === gleich ? { ...e, anzahl: Math.min(500, e.anzahl + 1) } : e,
        );
      }
      return [...alt, { ...v, key: crypto.randomUUID(), anzahl: 1 }];
    });
  }

  function anzahlSetzen(key: string, anzahl: number) {
    setStapel((alt) =>
      alt.map((e) =>
        e.key === key ? { ...e, anzahl: Math.min(500, Math.max(1, anzahl)) } : e,
      ),
    );
  }

  const eigenGueltig = eigen.text.trim().length > 0 && istHexFarbe(eigen.farbe);

  const bogenDaten = useMemo(
    () =>
      JSON.stringify({
        format: format
          ? { name: format.name, breite: format.breite, hoehe: format.hoehe }
          : null,
        zeilen: stapel.map(({ text, zusatz, farbe, stil, anzahl }) => ({
          text,
          zusatz,
          farbe,
          stil,
          anzahl,
        })),
      }),
    [format, stapel],
  );

  if (!format) {
    return (
      <p className="text-sm text-muted-foreground">Keine Schildgröße vorhanden.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Format und Druck ------------------------------------------ */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border p-4">
        <div className="space-y-1">
          <Label htmlFor="vorlagen-format">Schildgröße</Label>
          <select
            id="vorlagen-format"
            value={format.id}
            onChange={(e) => setFormatId(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            {formate.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {formatMass(f)} · {proBogen(f)} je Bogen
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">
            {gesamt} Schilder{gesamt > 0 ? ` · ${bogen} Bogen` : ""}
          </span>
          {stapel.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStapel([])}>
              Stapel leeren
            </Button>
          ) : null}
          <form
            method="post"
            action="/admin/preisschilder/vorlagen/druck"
            target="_blank"
          >
            <input type="hidden" name="bogen" value={bogenDaten} />
            <Button type="submit" disabled={gesamt === 0 || gesamt > MAX_SCHILDER}>
              <Printer className="size-4" aria-hidden />
              Druckbogen öffnen
            </Button>
          </form>
        </div>
      </div>

      {/* ---- Vorlagen --------------------------------------------------- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Fertige Vorlagen</h2>
          <p className="text-xs text-muted-foreground">
            Anklicken legt ein Schild auf den Stapel, ein weiterer Klick ein
            zweites.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {VORLAGEN.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => ablegen(v)}
              aria-label={`${v.text} auf den Stapel legen`}
              className="rounded-sm ring-1 ring-border transition hover:ring-2 hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <VorlagenSchild vorlage={v} format={format} />
            </button>
          ))}
        </div>
      </section>

      {/* ---- Eigenes Schild -------------------------------------------- */}
      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h2 className="text-sm font-semibold">Eigenes Schild</h2>
          <p className="text-xs text-muted-foreground">
            Text, Farbe und Stil frei wählen. Die Schrift passt sich der
            Schildgröße an; ein Zeilenumbruch im Text erzwingt eine neue Zeile (bis zu drei).
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="eigen-text">Text</Label>
              <textarea
                id="eigen-text"
                rows={2}
                maxLength={40}
                value={eigen.text}
                onChange={(e) => setEigen({ ...eigen, text: e.target.value })}
                placeholder="z. B. 3 FÜR 2"
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eigen-zusatz">Kleine Zeile darunter (optional)</Label>
              <Input
                id="eigen-zusatz"
                maxLength={60}
                value={eigen.zusatz}
                onChange={(e) => setEigen({ ...eigen, zusatz: e.target.value })}
                placeholder="z. B. Nur diese Woche"
              />
            </div>

            <div className="space-y-1">
              <Label>Farbe</Label>
              <div className="flex flex-wrap items-center gap-2">
                {VORLAGEN_FARBEN.map((f) => (
                  <button
                    key={f.farbe}
                    type="button"
                    title={f.name}
                    aria-label={f.name}
                    aria-pressed={eigen.farbe.toLowerCase() === f.farbe.toLowerCase()}
                    onClick={() => setEigen({ ...eigen, farbe: f.farbe })}
                    className={cn(
                      "size-7 rounded-full border border-border",
                      eigen.farbe.toLowerCase() === f.farbe.toLowerCase() &&
                        "ring-2 ring-offset-2 ring-brand",
                    )}
                    style={{ background: f.farbe }}
                  />
                ))}
                <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  eigene
                  <input
                    type="color"
                    value={istHexFarbe(eigen.farbe) ? eigen.farbe : "#000000"}
                    onChange={(e) => setEigen({ ...eigen, farbe: e.target.value })}
                    className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Stil</Label>
              <div className="flex gap-2">
                {(
                  [
                    ["flaeche", "Farbfläche"],
                    ["rahmen", "Rahmen"],
                  ] as [VorlagenStil, string][]
                ).map(([stil, name]) => (
                  <Button
                    key={stil}
                    type="button"
                    size="sm"
                    variant={eigen.stil === stil ? "default" : "outline"}
                    aria-pressed={eigen.stil === stil}
                    onClick={() => setEigen({ ...eigen, stil })}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              type="button"
              disabled={!eigenGueltig}
              onClick={() => ablegen({ ...eigen, text: eigen.text.trim(), zusatz: eigen.zusatz.trim() })}
            >
              <Plus className="size-4" aria-hidden />
              Auf den Stapel
            </Button>
          </div>

          <div className="flex items-start">
            <VorlagenSchild
              vorlage={{ ...eigen, text: eigen.text || "IHR TEXT" }}
              format={format}
            />
          </div>
        </div>
      </section>

      {/* ---- Stapel ----------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Stapel</h2>
        {stapel.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch nichts gewählt. Vorlage anklicken oder ein eigenes Schild
            anlegen.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {stapel.map((e) => (
              <li key={e.key} className="flex items-center gap-3 px-3 py-2">
                <span
                  className="size-4 shrink-0 rounded-full border border-border"
                  style={{ background: e.farbe }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{e.text.replace(/\n/g, " ")}</span>
                  {e.zusatz ? (
                    <span className="text-muted-foreground"> · {e.zusatz}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eins weniger"
                    onClick={() => anzahlSetzen(e.key, e.anzahl - 1)}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </Button>
                  <NumericInput
                    value={e.anzahl}
                    onChange={(n) => anzahlSetzen(e.key, n)}
                    className="h-8 w-16 text-center"
                    aria-label="Stückzahl"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eins mehr"
                    onClick={() => anzahlSetzen(e.key, e.anzahl + 1)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Entfernen"
                    onClick={() => setStapel((alt) => alt.filter((x) => x.key !== e.key))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {gesamt > MAX_SCHILDER ? (
          <p className="text-xs text-destructive">
            {gesamt} Schilder sind zu viel – höchstens {MAX_SCHILDER} auf einmal.
          </p>
        ) : null}
      </section>
    </div>
  );
}
