"use client";

import { useState } from "react";
import { Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { KatalogFeld } from "@/lib/actions/kataloge";
import {
  LAYOUT_NAMEN,
  PREISART_NAMEN,
  STIL_NAMEN,
  type KatalogAufbau,
  type KatalogEinstellungen,
} from "@/lib/katalog";

type Aendern = <F extends KatalogFeld & keyof KatalogEinstellungen>(
  feld: F,
  wert: KatalogEinstellungen[F],
) => void;

const SCHALTER_ARTIKEL = [
  ["zeigeBarcode", "Strichcode (EAN)"],
  ["zeigeBestand", "Verfügbare Menge"],
  ["zeigeKennzeichen", "Neu, Topseller, Reduzierung"],
  ["zeigeMerkmale", "Merkmale"],
  ["zeigeBeschreibung", "Beschreibung"],
  ["auchOhneFoto", "Auch Artikel ohne Foto (nur Liste)"],
] as const;

const SCHALTER_SEITEN = [
  ["mitTitelseite", "Titelseite"],
  ["mitInhalt", "Inhaltsverzeichnis"],
  ["mitTrennseiten", "Warengruppe auf neuer Seite"],
  ["reduziertZuerst", "Reduzierte Ware vorn als eigener Abschnitt"],
  ["mitRueckseite", "Rückseite mit Kontakt"],
] as const;

/**
 * Rechte Spalte: wie der Katalog aussieht, und die Ausgabe.
 *
 * Textfelder speichern beim Verlassen, nicht je Tastendruck – sonst stünde
 * mitten im Tippen ein halber Titel in der Datenbank, und jede Taste wäre
 * eine Anfrage. Alles andere speichert beim Klick.
 */
export function KatalogEinstellungenFeld({
  id,
  e,
  aufbau,
  ausgewaehlt,
  onAendern,
}: {
  id: string;
  e: KatalogEinstellungen;
  aufbau: KatalogAufbau;
  ausgewaehlt: number;
  onAendern: Aendern;
}) {
  const fehlen = ausgewaehlt - aufbau.gedruckt;
  const leer = aufbau.gesamtSeiten === 0;

  return (
    <aside className="space-y-5">
      <div className="space-y-3">
        <Textfeld
          label="Titel"
          wert={e.title}
          onSpeichern={(wert) => onAendern("title", wert || e.title)}
        />
        <Textfeld
          label="Untertitel"
          hinweis="Zeitraum oder Zusatz, z. B. „Oktober 2026“"
          wert={e.subtitle ?? ""}
          onSpeichern={(wert) => onAendern("subtitle", wert || null)}
        />
      </div>

      <Auswahl
        label="Raster"
        wert={e.layout}
        optionen={LAYOUT_NAMEN}
        onWahl={(wert) => onAendern("layout", wert)}
      />
      <Auswahl
        label="Aufmachung"
        wert={e.stil}
        optionen={STIL_NAMEN}
        onWahl={(wert) => onAendern("stil", wert)}
      />
      <Auswahl
        label="Preise"
        wert={e.preisart}
        optionen={PREISART_NAMEN}
        onWahl={(wert) => onAendern("preisart", wert)}
      />

      <Schaltergruppe label="Je Artikel">
        {SCHALTER_ARTIKEL.map(([feld, name]) => (
          <Schalter
            key={feld}
            name={name}
            an={e[feld]}
            onChange={(an) => onAendern(feld, an)}
          />
        ))}
      </Schaltergruppe>

      <Schaltergruppe label="Seiten">
        {SCHALTER_SEITEN.map(([feld, name]) => (
          <Schalter
            key={feld}
            name={name}
            an={e[feld]}
            onChange={(an) => onAendern(feld, an)}
          />
        ))}
      </Schaltergruppe>

      {e.mitRueckseite ? (
        <Textfeld
          label="Text auf der Rückseite"
          hinweis="Öffnungszeiten, Lieferbedingungen – optional"
          mehrzeilig
          wert={e.rueckseiteText ?? ""}
          onSpeichern={(wert) => onAendern("rueckseiteText", wert || null)}
        />
      ) : null}

      <div className="space-y-3 rounded-lg border border-border p-3">
        <dl className="space-y-1 text-sm tabular">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Seiten</dt>
            <dd className="font-medium">{aufbau.gesamtSeiten}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Artikel im Katalog</dt>
            <dd className="font-medium">{aufbau.gedruckt}</dd>
          </div>
          {fehlen > 0 ? (
            <div className="flex justify-between text-destructive">
              <dt>fehlen (Foto/Preis)</dt>
              <dd className="font-medium">{fehlen}</dd>
            </div>
          ) : null}
        </dl>

        {e.mitInhalt && !leer && aufbau.inhalt === null ? (
          <p className="text-xs text-muted-foreground">
            Kein Inhaltsverzeichnis: es lohnt erst ab acht Seiten.
          </p>
        ) : null}

        {/* Links und keine Knöpfe mit Skript: der Bogen ist eine eigene
            Adresse und öffnet in einem eigenen Fenster. */}
        <div className="grid gap-2">
          <Button asChild={!leer} disabled={leer}>
            {leer ? (
              <span>
                <Printer aria-hidden /> Drucken / PDF
              </span>
            ) : (
              <a
                href={`/admin/kataloge/${id}/druck`}
                target="_blank"
                rel="noreferrer"
              >
                <Printer aria-hidden /> Drucken / PDF
              </a>
            )}
          </Button>
          <Button asChild={!leer} variant="outline" disabled={leer}>
            {leer ? (
              <span>
                <Eye aria-hidden /> Vorschau
              </span>
            ) : (
              <a
                href={`/admin/kataloge/${id}/druck?druck=0`}
                target="_blank"
                rel="noreferrer"
              >
                <Eye aria-hidden /> Vorschau
              </a>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Für ein PDF im Druckdialog „Als PDF sichern“ wählen, Ränder „Keine“,
          Hintergrundgrafiken an.
        </p>
      </div>
    </aside>
  );
}

/**
 * Textfeld mit eigenem Entwurf. Gespeichert wird beim Verlassen und nur,
 * wenn sich etwas geändert hat. Kommt von außen ein anderer Wert (die
 * Änderung wurde zurückgenommen), zieht der Entwurf nach.
 */
function Textfeld({
  label,
  hinweis,
  wert,
  mehrzeilig,
  onSpeichern,
}: {
  label: string;
  hinweis?: string;
  wert: string;
  mehrzeilig?: boolean;
  onSpeichern: (wert: string) => void;
}) {
  const [entwurf, setEntwurf] = useState(wert);
  const [gesehen, setGesehen] = useState(wert);
  if (wert !== gesehen) {
    setGesehen(wert);
    setEntwurf(wert);
  }

  const eigenschaften = {
    value: entwurf,
    "aria-label": label,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setEntwurf(event.target.value),
    onBlur: () => {
      const sauber = entwurf.trim();
      if (sauber !== wert) onSpeichern(sauber);
      // Ein leer gelassener Pflichttitel springt auf den alten Wert zurück.
      else if (entwurf !== wert) setEntwurf(wert);
    },
  };

  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {mehrzeilig ? (
        <Textarea rows={4} maxLength={1200} {...eigenschaften} />
      ) : (
        <Input
          maxLength={160}
          {...eigenschaften}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      )}
      {hinweis ? (
        <span className="block text-[11px] text-muted-foreground">{hinweis}</span>
      ) : null}
    </label>
  );
}

function Auswahl<T extends string>({
  label,
  wert,
  optionen,
  onWahl,
}: {
  label: string;
  wert: T;
  optionen: Record<T, string>;
  onWahl: (wert: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="grid gap-1">
        {(Object.keys(optionen) as T[]).map((key) => {
          const gewaehlt = key === wert;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={gewaehlt}
              onClick={() => onWahl(key)}
              className={`rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                gewaehlt
                  ? "border-brand bg-brand font-medium text-brand-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {optionen[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Schaltergruppe({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Schalter({
  name,
  an,
  onChange,
}: {
  name: string;
  an: boolean;
  onChange: (an: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={an}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-brand"
      />
      {name}
    </label>
  );
}
