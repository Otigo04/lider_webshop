# Rechnung hochladen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf `/admin/bestand` lässt sich eine PDF-Rechnung hochladen; die Positionen werden eingelesen, geprüft und nach Bestätigung über `record_stock_entries()` in den Bestand gebucht.

**Architecture:** Ein Route Handler (`POST /admin/bestand/rechnung`) schickt das PDF an ein Modell über das Vercel AI Gateway (AI SDK, `generateText` + `Output.object`) und gleicht die EANs in einer Abfrage mit dem Artikelstamm ab. Alle Rechnerei (Gegenproben, Preisregeln, Zusammenlegen) steckt in reinen Funktionen in `lib/rechnung-import.ts` mit `npm test`. Ein Dialog zeigt die Vorschau, der Admin korrigiert und bestätigt, gebucht wird über die vorhandene Server Action `recordStockEntries()`.

**Tech Stack:** Next.js 16 (Route Handler, Server Components), TypeScript, AI SDK 6 (`ai`) über AI Gateway, zod, Supabase, Node-Testrunner (`npm test`).

Spec: `docs/superpowers/specs/2026-10-08-rechnung-hochladen-design.md`

## Global Constraints

- Gebucht wird in der Datenbank (`record_stock_entries` über `recordStockEntries()`), der Browser rechnet nur für die Anzeige. Kein zweiter Buchungsweg.
- Steuersatz kommt aus `company_settings.pos_vat_rate`, nie festverdrahtet.
- Leeres Preisfeld heißt „unverändert“, nicht „0 €“. Bekannte Artikel bekommen `unitPrice: null`, `retailPrice: null`.
- Der Einkaufspreis wird nie gedruckt oder an Kunden geladen. Die Seite ist Admin-only (`requireAdmin()`).
- Zahlenfelder nur über `NumericInput` (`components/numeric-input.tsx`), nie `<Input type="number">`.
- Keine Migration. Keine Rechnungs-PDFs oder Lieferantendaten ins Repo.
- Alle sichtbaren Texte deutsch, sachlich, keine KI-Optik (siehe Design-Richtlinie in `CLAUDE.md`).
- Vor jedem Commit: `npm test`, `npm run lint`, `npm run build` (Typecheck läuft über den Build).
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung |
|-------|---------------|
| `lib/rechnung-import.ts` (neu) | Schema, Bereinigung, Gegenproben, Preisregeln, Zusammenlegen. Rein, ohne Server/Browser-Bezug. |
| `tests/rechnung-import.test.ts` (neu) | Tests dazu. |
| `lib/rechnung-lesen.ts` (neu) | `leseRechnung(bytes, categories)`: Prompt + Modellaufruf. Kein `server-only`, damit das Prüfskript es nutzen kann. |
| `scripts/rechnung-lesen-check.mjs` (neu) | Liest ein PDF von der Platte, ruft `leseRechnung()`, druckt Positionen und Gegenproben. Zum Prüfen mit echten Rechnungen. |
| `lib/queries/stock.ts` (ändern) | `findGebuchteRechnung(nummer)` für den Doppelt-Schutz. |
| `app/admin/bestand/rechnung/route.ts` (neu) | Upload, Prüfung der Datei, Lesen, Abgleich, JSON-Antwort. |
| `components/admin/wareneingang-rechnung.tsx` (neu) | Dialog: Datei wählen, Vorschau, Buchen. |
| `components/admin/wareneingang.tsx` (ändern) | Knopf „Rechnung hochladen“ und Einbindung des Dialogs. |
| `docs/lager.md` (ändern) | Abschnitt „Rechnung hochladen“. |

---

### Task 1: Reine Funktionen und Tests

**Files:**
- Create: `lib/rechnung-import.ts`
- Test: `tests/rechnung-import.test.ts`

**Interfaces:**
- Produces (von späteren Tasks genutzt):
  - `positionSchema`, `rechnungSchema` (zod); Typen `RechnungPosition`, `Rechnung`, `RechnungAntwort`
  - `TOLERANZ_CENT = 6`
  - `bereinige(r: Rechnung): Rechnung`
  - `ekProStueck(p: RechnungPosition): number`
  - `erwarteterBetrag(p: RechnungPosition): number`
  - `zeileStimmt(p: RechnungPosition): boolean`
  - `pruefeSumme(r: Pick<Rechnung, "positionen" | "nettoGesamt" | "nebenkostenNetto">): { summe: number; erwartet: number; ok: boolean }`
  - `grosshandelAusEk(ek: number): number`, `ehAusEk(ek: number): number`
  - `preiseNeuerArtikel(p: RechnungPosition, mwstSatz: number): { ek: number; gh: number; eh: number }`
  - `fasseZusammen(positionen: RechnungPosition[]): RechnungPosition[]`

- [ ] **Step 1: Test schreiben**

Datei `tests/rechnung-import.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bereinige,
  ehAusEk,
  ekProStueck,
  erwarteterBetrag,
  fasseZusammen,
  grosshandelAusEk,
  preiseNeuerArtikel,
  pruefeSumme,
  zeileStimmt,
  type Rechnung,
  type RechnungPosition,
} from "@/lib/rechnung-import";

function pos(teil: Partial<RechnungPosition>): RechnungPosition {
  return {
    ean: null,
    artikelnummer: null,
    name: "Test",
    menge: 1,
    listenpreis: 1,
    rabattProzent: 0,
    uvp: null,
    zeilenbetrag: 1,
    warengruppeId: null,
    ...teil,
  };
}

test("Einkaufspreis je Stück: Listenpreis abzüglich Rabatt, auf den Cent", () => {
  assert.equal(ekProStueck(pos({ listenpreis: 1.09, rabattProzent: 10 })), 0.98);
  assert.equal(ekProStueck(pos({ listenpreis: 2.54, rabattProzent: 10 })), 2.29);
  assert.equal(ekProStueck(pos({ listenpreis: 14.19, rabattProzent: 0 })), 14.19);
});

test("erwarteter Zeilenbetrag rechnet ohne vorheriges Runden des Stückpreises", () => {
  // 120 × 1,09 × 0,9 = 117,72 – mit gerundetem Stückpreis (0,98) wären es 117,60
  assert.equal(erwarteterBetrag(pos({ menge: 120, listenpreis: 1.09, rabattProzent: 10 })), 117.72);
});

test("Gegenprobe je Zeile: 6 Cent Toleranz, 7 nicht mehr", () => {
  const basis = { menge: 120, listenpreis: 1.09, rabattProzent: 10 };
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 117.72 })), true);
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 117.66 })), true);
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 117.65 })), false);
  assert.equal(zeileStimmt(pos({ ...basis, zeilenbetrag: 118.0 })), false);
});

test("Summenprobe: Rechnung 26040197140 (Servicegebühr abgezogen)", () => {
  const r = {
    positionen: [
      pos({ zeilenbetrag: 117.72 }),
      pos({ zeilenbetrag: 49.92 }),
      pos({ zeilenbetrag: 128.52 }),
    ],
    nettoGesamt: 300.11,
    nebenkostenNetto: 3.95,
  };
  const ergebnis = pruefeSumme(r);
  assert.equal(ergebnis.summe, 296.16);
  assert.equal(ergebnis.erwartet, 296.16);
  assert.equal(ergebnis.ok, true);
});

test("Summenprobe schlägt an, wenn eine Zeile fehlt", () => {
  const r = {
    positionen: [pos({ zeilenbetrag: 117.72 }), pos({ zeilenbetrag: 49.92 })],
    nettoGesamt: 300.11,
    nebenkostenNetto: 3.95,
  };
  assert.equal(pruefeSumme(r).ok, false);
});

test("neuer Artikel mit UVP: Laden = UVP, Großhandel = UVP netto", () => {
  const p = pos({ uvp: 23.99, listenpreis: 14.19 });
  assert.deepEqual(preiseNeuerArtikel(p, 19), { ek: 14.19, gh: 20.16, eh: 23.99 });
  assert.equal(preiseNeuerArtikel(pos({ uvp: 7.99 }), 19).gh, 6.71);
  assert.equal(preiseNeuerArtikel(pos({ uvp: 2.49 }), 19).gh, 2.09);
});

test("UVP-Regel nimmt den Steuersatz aus den Firmendaten", () => {
  assert.equal(preiseNeuerArtikel(pos({ uvp: 10.7 }), 7).gh, 10);
});

test("Großhandel ohne UVP: EK × 1,30, aufgerundet auf 10 Cent", () => {
  assert.equal(grosshandelAusEk(0.39), 0.6);
  assert.equal(grosshandelAusEk(0.5), 0.7);
  assert.equal(grosshandelAusEk(1.38), 1.8);
  // 100 × 1,3 ist in Gleitkomma 130,00000000000001 – darf nicht auf 1,40 kippen
  assert.equal(grosshandelAusEk(1.0), 1.3);
});

test("Laden ohne UVP: EK × 2, aufgerundet auf die nächste X,99 €", () => {
  assert.equal(ehAusEk(0.39), 0.99);
  assert.equal(ehAusEk(0.5), 1.99);
  assert.equal(ehAusEk(1.38), 2.99);
  assert.equal(ehAusEk(3.0), 6.99);
});

test("neuer Artikel ohne UVP (auch UVP 0) nutzt die Aufschläge", () => {
  const ohne = preiseNeuerArtikel(pos({ listenpreis: 0.39, uvp: null }), 19);
  assert.deepEqual(ohne, { ek: 0.39, gh: 0.6, eh: 0.99 });
  assert.deepEqual(preiseNeuerArtikel(pos({ listenpreis: 0.39, uvp: 0 }), 19), ohne);
});

test("gleicher Barcode zweimal heißt eine Zeile mit summierter Menge", () => {
  const liste = fasseZusammen([
    pos({ ean: "4018587753000", menge: 60, zeilenbetrag: 58.86 }),
    pos({ ean: "4018587753000", menge: 60, zeilenbetrag: 58.86 }),
  ]);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].menge, 120);
  assert.equal(liste[0].zeilenbetrag, 117.72);
});

test("Zeilen ohne Barcode und verschiedene Barcodes bleiben getrennt", () => {
  const liste = fasseZusammen([
    pos({ ean: null, name: "A" }),
    pos({ ean: null, name: "A" }),
    pos({ ean: "4018587753000" }),
    pos({ ean: "3588270022054" }),
  ]);
  assert.equal(liste.length, 4);
});

test("Bereinigen: Ziffern, Mindestlänge, ganze Mengen, Nullmengen raus", () => {
  const roh: Rechnung = {
    lieferant: " Iden ",
    rechnungsnummer: " 26040197140 ",
    datum: "06.10.2026",
    nettoGesamt: 1,
    nebenkostenNetto: 0,
    positionen: [
      pos({ ean: "0196 214 147249", name: "  Poster  ", menge: 4.0 }),
      pos({ ean: "ABC", name: "ohne Code" }),
      pos({ ean: "123", name: "zu kurz" }),
      pos({ ean: "4018587753000", name: "Menge null", menge: 0 }),
    ],
  };
  const sauber = bereinige(roh);
  assert.equal(sauber.lieferant, "Iden");
  assert.equal(sauber.rechnungsnummer, "26040197140");
  assert.equal(sauber.positionen.length, 3);
  assert.equal(sauber.positionen[0].ean, "0196214147249");
  assert.equal(sauber.positionen[0].name, "Poster");
  assert.equal(sauber.positionen[1].ean, null);
  assert.equal(sauber.positionen[2].ean, null);
});
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

Run: `npm test 2>&1 | tail -15`
Expected: FAIL, `Cannot find module` bzw. `lib/rechnung-import.ts` fehlt.

- [ ] **Step 3: Implementierung**

Datei `lib/rechnung-import.ts`:

```ts
import { z } from "zod";
import type { PosProduct } from "@/lib/queries/pos";

/**
 * Rechnung hochladen – die reinen Funktionen.
 *
 * Die KI liest ab, sie rechnet nicht: Preise, Summen und Prüfungen entstehen
 * hier. Ohne Server- und Browser-Bezug, damit sich jede Regel mit `npm test`
 * prüfen lässt – es geht um Geld.
 *
 * Gerechnet wird in Cent (ganze Zahlen), wo verglichen wird: 117,66 und
 * 117,72 sind in Gleitkomma 6 Cent auseinander oder 6,0000000000001, und
 * die Toleranz soll nicht vom Zufall der Darstellung abhängen.
 */

export const positionSchema = z.object({
  /** GTIN der Zeile, leer erlaubt (Alpalium führt keine). */
  ean: z.string().nullable(),
  /** Artikelnummer des Lieferanten – nicht unsere. Nur zur Orientierung. */
  artikelnummer: z.string().nullable(),
  name: z.string(),
  menge: z.number(),
  /** Listenpreis je Stück, netto, vor Rabatt. Bei Iden die Spalte „VK-Preis“. */
  listenpreis: z.number(),
  /** Rabatt der Zeile in Prozent, 0 ohne Rabatt. */
  rabattProzent: z.number(),
  /** Unverbindliche Preisempfehlung, brutto; null, wenn die Rechnung keine führt. */
  uvp: z.number().nullable(),
  /** Zeilenbetrag netto laut Rechnung – dient nur der Gegenprobe. */
  zeilenbetrag: z.number(),
  /** Vorschlag aus der Warengruppenliste; null, wenn unsicher. */
  warengruppeId: z.string().nullable(),
});

export const rechnungSchema = z.object({
  lieferant: z.string(),
  rechnungsnummer: z.string(),
  /** TT.MM.JJJJ, null, wenn nicht lesbar. */
  datum: z.string().nullable(),
  /** „Gesamt ohne MwSt.“ laut Rechnung. */
  nettoGesamt: z.number(),
  /** Servicegebühr, Versand, Verpackung – netto, keine Artikel. */
  nebenkostenNetto: z.number(),
  positionen: z.array(positionSchema),
});

export type RechnungPosition = z.infer<typeof positionSchema>;
export type Rechnung = z.infer<typeof rechnungSchema>;

/** Antwort des Route Handlers an den Dialog. */
export interface RechnungAntwort {
  rechnung: Rechnung;
  /** Gefundene Artikel, Schlüssel = gelesene EAN. Was fehlt, wird neu angelegt. */
  produkte: Record<string, PosProduct>;
  /** created_at der Journalzeilen, wenn die Rechnungsnummer schon gebucht ist. */
  bereitsGebuchtAm: string | null;
  /** MwSt-Satz in Prozent aus company_settings.pos_vat_rate. */
  mwstSatz: number;
  /** Zuletzt benutzte Warengruppe – Vorgabe für Neuanlagen ohne Vorschlag. */
  vorgabeKategorieId: string | null;
}

/** Toleranz der Gegenproben, in Cent. */
export const TOLERANZ_CENT = 6;

const cent = (betrag: number) => Math.round(betrag * 100);
const runde2 = (betrag: number) => cent(betrag) / 100;

/**
 * Gelesene Rechnung säubern.
 *
 * EAN nur aus Ziffern und mindestens acht lang (kürzer ist keine GTIN),
 * Mengen ganzzahlig, Zeilen ohne Menge raus – ein gelesenes „0 Stück“ ist
 * ein Lesefehler oder eine Textzeile, keine Buchung.
 */
export function bereinige(r: Rechnung): Rechnung {
  return {
    ...r,
    lieferant: r.lieferant.trim(),
    rechnungsnummer: r.rechnungsnummer.trim(),
    positionen: r.positionen
      .map((p) => {
        const ziffern = (p.ean ?? "").replace(/\D/g, "");
        return {
          ...p,
          name: p.name.trim(),
          menge: Math.round(p.menge),
          ean: ziffern.length >= 8 ? ziffern : null,
        };
      })
      .filter((p) => p.menge > 0),
  };
}

/** Einkaufspreis je Stück: Listenpreis abzüglich Rabatt, auf den Cent. */
export function ekProStueck(p: RechnungPosition): number {
  return runde2(p.listenpreis * (1 - p.rabattProzent / 100));
}

/**
 * Zeilenbetrag, wie er laut Menge, Listenpreis und Rabatt sein müsste.
 * Nicht aus dem gerundeten Stückpreis: 120 × 0,98 wären 117,60, die Rechnung
 * sagt 117,72, weil sie erst am Ende rundet.
 */
export function erwarteterBetrag(p: RechnungPosition): number {
  return p.menge * p.listenpreis * (1 - p.rabattProzent / 100);
}

export function zeileStimmt(p: RechnungPosition): boolean {
  return Math.abs(cent(erwarteterBetrag(p)) - cent(p.zeilenbetrag)) <= TOLERANZ_CENT;
}

/** Summe der Zeilen gegen „Gesamt ohne MwSt.“ abzüglich Nebenkosten. */
export function pruefeSumme(
  r: Pick<Rechnung, "positionen" | "nettoGesamt" | "nebenkostenNetto">,
): { summe: number; erwartet: number; ok: boolean } {
  const summe = r.positionen.reduce((s, p) => s + cent(p.zeilenbetrag), 0);
  const erwartet = cent(r.nettoGesamt) - cent(r.nebenkostenNetto);
  return {
    summe: summe / 100,
    erwartet: erwartet / 100,
    ok: Math.abs(summe - erwartet) <= TOLERANZ_CENT,
  };
}

/**
 * Großhandelspreis ohne UVP: EK × 1,30, aufgerundet auf 10 Cent.
 * Ganzzahlig gerechnet (× 13 ÷ 10): 100 × 1,3 ergibt in Gleitkomma
 * 130,00000000000001, und aufgerundet stünde 1,40 statt 1,30 am Regal.
 */
export function grosshandelAusEk(ek: number): number {
  const mindest = Math.ceil((cent(ek) * 13) / 10);
  return (Math.ceil(mindest / 10) * 10) / 100;
}

/** Ladenpreis ohne UVP: EK × 2, aufgerundet auf die nächste X,99 €. */
export function ehAusEk(ek: number): number {
  const mindest = cent(ek) * 2;
  const basis99 = Math.floor(mindest / 100) * 100 + 99;
  return (basis99 >= mindest ? basis99 : basis99 + 100) / 100;
}

/**
 * Preise eines neuen Artikels.
 *
 * Mit UVP (Iden): Laden = UVP, Großhandel = UVP netto. Ohne (Alpalium):
 * Aufschläge auf den Einkaufspreis. Aufgerundet, nie abgerundet – ein Preis
 * unter dem Einkauf darf nicht entstehen.
 */
export function preiseNeuerArtikel(
  p: RechnungPosition,
  mwstSatz: number,
): { ek: number; gh: number; eh: number } {
  const ek = ekProStueck(p);
  if (p.uvp !== null && p.uvp > 0) {
    return { ek, gh: runde2(p.uvp / (1 + mwstSatz / 100)), eh: runde2(p.uvp) };
  }
  return { ek, gh: grosshandelAusEk(ek), eh: ehAusEk(ek) };
}

/**
 * Gleicher Barcode zweimal heißt eine Zeile mit summierter Menge – wie im
 * Sammelimport. Zeilen ohne Barcode bleiben getrennt, auch wenn sie gleich
 * heißen.
 */
export function fasseZusammen(positionen: RechnungPosition[]): RechnungPosition[] {
  const ergebnis: RechnungPosition[] = [];
  const nachCode = new Map<string, number>();

  for (const p of positionen) {
    const index = p.ean ? nachCode.get(p.ean) : undefined;
    if (index === undefined) {
      if (p.ean) nachCode.set(p.ean, ergebnis.length);
      ergebnis.push({ ...p });
      continue;
    }
    const vorhanden = ergebnis[index];
    ergebnis[index] = {
      ...vorhanden,
      menge: vorhanden.menge + p.menge,
      zeilenbetrag: runde2(vorhanden.zeilenbetrag + p.zeilenbetrag),
    };
  }
  return ergebnis;
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npm test 2>&1 | tail -15`
Expected: alle Tests grün, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/rechnung-import.ts tests/rechnung-import.test.ts
git commit -m "feat(wareneingang): Rechenregeln für den Rechnungsimport mit Tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rechnung mit der KI lesen und an echten PDFs prüfen

**Files:**
- Create: `lib/rechnung-lesen.ts`
- Create: `scripts/rechnung-lesen-check.mjs`

**Interfaces:**
- Consumes: `rechnungSchema`, `bereinige`, `Rechnung` aus Task 1.
- Produces: `leseRechnung(bytes: Uint8Array, kategorien: { id: string; name: string }[]): Promise<Rechnung>` (liefert bereits bereinigt, wirft bei Fehler).

- [ ] **Step 1: `lib/rechnung-lesen.ts` schreiben**

```ts
import { generateText, Output } from "ai";
import { bereinige, rechnungSchema, type Rechnung } from "@/lib/rechnung-import";

/**
 * Rechnung mit dem Modell ablesen.
 *
 * Eigene Datei ohne `server-only`: das Prüfskript
 * `scripts/rechnung-lesen-check.mjs` ruft dieselbe Funktion wie der Route
 * Handler, damit ein echtes PDF ohne Browser und Anmeldung geprüft werden kann.
 *
 * Das Modell liest nur ab. Gerechnet und geprüft wird in
 * `lib/rechnung-import.ts`.
 */

/** Sonnet statt Haiku: eine falsch gelesene Menge steht sonst im Bestand. */
export const RECHNUNG_MODELL = "anthropic/claude-sonnet-4.5";

function prompt(kategorien: { id: string; name: string }[]): string {
  const liste =
    kategorien.length > 0
      ? kategorien.map((k) => `${k.id}: ${k.name}`).join("\n")
      : "(keine)";
  return `Lies diese Lieferantenrechnung eines Großhändlers ab. Rechne nichts nach, gib nur wieder, was dort steht.

Kopf:
- lieferant: Name des Rechnungsstellers (Firma im Briefkopf).
- rechnungsnummer: die Rechnungs- oder Auftragsnummer.
- datum: Rechnungsdatum als TT.MM.JJJJ, null wenn nicht lesbar.
- nettoGesamt: "Gesamt ohne MwSt." (Netto-Endsumme).
- nebenkostenNetto: Summe aus Servicegebühr, Versand, Verpackung u. ä. (netto). Diese Zeilen sind KEINE Artikel und kommen nicht in positionen. Gibt es keine: 0.

Je Artikelzeile:
- ean: die 13-stellige (oder 8-stellige) GTIN/EAN der Zeile, nur Ziffern. Bei Zeilen mit mehreren Nummern ("10224869 / 0196214147249 / 14724") ist es die lange mittlere. Keine vorhanden: null.
- artikelnummer: die Artikelnummer des Lieferanten, null wenn keine.
- name: Bezeichnung wie auf der Rechnung, auf eine Zeile zusammengezogen.
- menge: Stückzahl (Verkaufseinheiten, wie in der Spalte Menge).
- listenpreis: Preis je Einheit netto vor Rabatt (Spalte "VK-Preis", "E-Preis" o. ä.).
- rabattProzent: Rabatt der Zeile in Prozent, 0 wenn keiner.
- uvp: unverbindliche Preisempfehlung brutto (Spalte "UVP"), null wenn die Rechnung keine führt.
- zeilenbetrag: Zeilenbetrag netto laut Rechnung (Spalte "Betrag").
- warengruppeId: die ID der passendsten Warengruppe aus der Liste unten, null wenn du unsicher bist.

Warengruppen:
${liste}`;
}

export async function leseRechnung(
  bytes: Uint8Array,
  kategorien: { id: string; name: string }[],
): Promise<Rechnung> {
  const { output } = await generateText({
    model: RECHNUNG_MODELL,
    output: Output.object({ schema: rechnungSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt(kategorien) },
          { type: "file", data: bytes, mediaType: "application/pdf" },
        ],
      },
    ],
  });

  const ids = new Set(kategorien.map((k) => k.id));
  const gelesen = bereinige(output);
  return {
    ...gelesen,
    // Eine erfundene ID wäre beim Buchen ein Fremdschlüsselfehler.
    positionen: gelesen.positionen.map((p) => ({
      ...p,
      warengruppeId: p.warengruppeId && ids.has(p.warengruppeId) ? p.warengruppeId : null,
    })),
  };
}
```

- [ ] **Step 2: Prüfskript schreiben**

Datei `scripts/rechnung-lesen-check.mjs`:

```js
/**
 * Prüft das Rechnungslesen an einem echten PDF, ohne Browser und Anmeldung.
 *
 *   node --import ./tests/register.mjs --experimental-strip-types \
 *     --disable-warning=ExperimentalWarning --env-file=.env.local \
 *     scripts/rechnung-lesen-check.mjs "<pfad zum pdf>"
 *
 * Druckt die gelesenen Positionen samt Gegenproben. Bucht nichts.
 */
import { readFile } from "node:fs/promises";
import { leseRechnung } from "@/lib/rechnung-lesen";
import { pruefeSumme, zeileStimmt } from "@/lib/rechnung-import";

const pfad = process.argv[2];
if (!pfad) {
  console.error("Aufruf: … rechnung-lesen-check.mjs <pdf>");
  process.exit(1);
}

const bytes = new Uint8Array(await readFile(pfad));
const r = await leseRechnung(bytes, []);

console.log(`${r.lieferant} · Rechnung ${r.rechnungsnummer} · ${r.datum ?? "ohne Datum"}`);
for (const p of r.positionen) {
  console.log(
    ` ${zeileStimmt(p) ? " " : "!"} ${(p.ean ?? "-").padEnd(14)} ${String(p.menge).padStart(4)} × ${p.listenpreis} -${p.rabattProzent}%  UVP ${p.uvp ?? "-"}  = ${p.zeilenbetrag}  ${zeileStimmt(p) ? "ok" : "ZEILE PASST NICHT"}  ${p.name.slice(0, 50)}`,
  );
}
const s = pruefeSumme(r);
console.log(
  `${r.positionen.length} Positionen · Summe ${s.summe} · erwartet ${s.erwartet} (Netto ${r.nettoGesamt} − Nebenkosten ${r.nebenkostenNetto}) · ${s.ok ? "OK" : "SUMME PASST NICHT"}`,
);
```

- [ ] **Step 3: Mit beiden echten Rechnungen prüfen**

Run (Pfad mit Leerzeichen in Anführungszeichen):

```bash
node --import ./tests/register.mjs --experimental-strip-types --disable-warning=ExperimentalWarning --env-file=.env.local scripts/rechnung-lesen-check.mjs "/Users/otigo_mac/Downloads/Verkaufsrechnung 26040197140.pdf"
node --import ./tests/register.mjs --experimental-strip-types --disable-warning=ExperimentalWarning --env-file=.env.local scripts/rechnung-lesen-check.mjs "/Users/otigo_mac/Downloads/Verkaufsrechnung 26080071391.pdf"
```

Expected:
- Rechnung 26040197140: 3 Positionen (120 / 43 / 120 Stück), Summe 296.16 = erwartet 296.16, `OK`.
- Rechnung 26080071391: 17 Positionen, 465 Stück, Summe 891.1 = erwartet 891.1, `OK`, keine Zeile `ZEILE PASST NICHT`.

Scheitert der Aufruf mit „model not found“, die Modell-ID in `RECHNUNG_MODELL` an eine im AI Gateway vorhandene Sonnet-Kennung anpassen (`vercel ai-gateway models` bzw. Gateway-Modellliste) und erneut laufen lassen. Weichen Positionen von der Rechnung ab, den Prompt in `lib/rechnung-lesen.ts` an der Stelle schärfen, die falsch gelesen wurde, und wiederholen.

- [ ] **Step 4: Lint, Commit**

```bash
npm run lint 2>&1 | grep -E "error|✖"
git add lib/rechnung-lesen.ts scripts/rechnung-lesen-check.mjs
git commit -m "feat(wareneingang): Rechnung per KI ablesen, Prüfskript für echte PDFs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Doppelt-Schutz und Route Handler

**Files:**
- Modify: `lib/queries/stock.ts` (am Ende der Datei anfügen)
- Create: `app/admin/bestand/rechnung/route.ts`

**Interfaces:**
- Consumes: `leseRechnung` (Task 2), `RechnungAntwort` (Task 1), `findProductsByCodes` (`lib/queries/pos.ts`), `getCategories`, `getLastUsedCategoryId` (`lib/queries/products.ts`), `getCompanySettings` (`lib/queries/settings.ts`), `requireAdmin` (`lib/auth`).
- Produces: `findGebuchteRechnung(nummer: string): Promise<string | null>`; `POST /admin/bestand/rechnung` (multipart, Feld `datei`) → `RechnungAntwort` als JSON, bei Fehler `{ error: string }` mit Status 400/413/422/502.

- [ ] **Step 1: `findGebuchteRechnung` anfügen**

Am Ende von `lib/queries/stock.ts`:

```ts
/**
 * Wurde diese Rechnung schon gebucht? Antwort: created_at der jüngsten
 * Journalzeile, sonst null.
 *
 * Gesucht wird die Rechnungsnummer in der Notiz der Buchung („Iden, Rechnung
 * 26080071391 vom 06.10.2026“) – so findet sie auch Lieferungen, die früher
 * über ein Skript gebucht wurden. Platzhalter der Suche werden entfernt, und
 * unter vier Zeichen gibt es keine Antwort: „1“ stünde in jeder Notiz.
 */
export async function findGebuchteRechnung(nummer: string): Promise<string | null> {
  const sauber = nummer.replace(/[%_,()*\\]/g, " ").trim();
  if (sauber.length < 4) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_entries")
    .select("created_at")
    .ilike("note", `%${sauber}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[wareneingang] Rechnung schon gebucht?", error.message);
    return null;
  }
  return (data?.[0]?.created_at as string | undefined) ?? null;
}
```

- [ ] **Step 2: Route Handler schreiben**

Datei `app/admin/bestand/rechnung/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findProductsByCodes } from "@/lib/queries/pos";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";
import { getCompanySettings } from "@/lib/queries/settings";
import { findGebuchteRechnung } from "@/lib/queries/stock";
import { leseRechnung } from "@/lib/rechnung-lesen";
import type { RechnungAntwort } from "@/lib/rechnung-import";

/**
 * Rechnung lesen – Upload, KI, Abgleich. Bucht nichts.
 *
 * Route Handler statt Server Action: eine Server Action nimmt nur 1 MB
 * Body an, ein PDF mit Logo und Kleingedrucktem ist größer. Die Grenze hier
 * ist die von Vercel für Anfragen (4,5 MB), mit etwas Luft.
 *
 * Der Abgleich läuft gleich hier, in einer Abfrage, damit der Dialog nur eine
 * Antwort abwarten muss. Gebucht wird danach vom Dialog über
 * `recordStockEntries()` – ein einziger Buchungsweg.
 */

export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;

function fehler(text: string, status: number) {
  return NextResponse.json({ error: text }, { status });
}

export async function POST(request: Request) {
  await requireAdmin();

  let datei: FormDataEntryValue | null;
  try {
    datei = (await request.formData()).get("datei");
  } catch {
    return fehler("Die Datei konnte nicht gelesen werden.", 400);
  }

  if (!(datei instanceof File)) return fehler("Bitte eine PDF-Datei wählen.", 400);
  if (datei.size > MAX_BYTES) {
    return fehler("Die Datei ist größer als 4 MB. Bitte verkleinern.", 413);
  }

  const bytes = new Uint8Array(await datei.arrayBuffer());
  // Dateiendung und Typ kommen vom Browser – maßgeblich ist der Dateikopf.
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return fehler("Das ist keine PDF-Datei.", 400);
  }

  const kategorien = await getCategories();

  let rechnung;
  try {
    rechnung = await leseRechnung(
      bytes,
      kategorien.map((k) => ({ id: k.id, name: k.name })),
    );
  } catch (ursache) {
    console.error("[wareneingang] Rechnung lesen:", ursache);
    return fehler(
      "Die Rechnung konnte nicht gelesen werden. Bitte noch einmal versuchen oder den Wareneingang von Hand erfassen.",
      502,
    );
  }

  if (rechnung.positionen.length === 0) {
    return fehler("Auf der Rechnung wurden keine Artikelzeilen gefunden.", 422);
  }

  const codes = rechnung.positionen
    .map((p) => p.ean)
    .filter((code): code is string => Boolean(code));

  const [gefunden, bereitsGebuchtAm, einstellungen, vorgabeKategorieId] =
    await Promise.all([
      findProductsByCodes(codes),
      findGebuchteRechnung(rechnung.rechnungsnummer),
      getCompanySettings(),
      getLastUsedCategoryId(),
    ]);

  const antwort: RechnungAntwort = {
    rechnung,
    produkte: Object.fromEntries(gefunden),
    bereitsGebuchtAm,
    mwstSatz: Number(einstellungen.pos_vat_rate),
    vorgabeKategorieId,
  };
  return NextResponse.json(antwort);
}
```

- [ ] **Step 3: Build (Typecheck)**

Run: `npm run build 2>&1 | grep -iE "error|failed|Type" | head`
Expected: keine Ausgabe (Build grün). `/admin/bestand/rechnung` taucht als `ƒ` in der Routenliste auf.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/stock.ts app/admin/bestand/rechnung/route.ts
git commit -m "feat(wareneingang): Route zum Lesen einer Rechnung samt Abgleich und Doppelt-Schutz

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dialog mit Vorschau und Buchen

**Files:**
- Create: `components/admin/wareneingang-rechnung.tsx`
- Modify: `components/admin/wareneingang.tsx` (Import ergänzen, State, Knopf neben „Liste einfügen“ bei Zeile ~926, Dialog neben `<WareneingangImport …/>` bei Zeile ~934)

**Interfaces:**
- Consumes: alles aus `lib/rechnung-import.ts` (Task 1), `POST /admin/bestand/rechnung` (Task 3), `recordStockEntries` (`lib/actions/stock.ts`).
- Produces: `WareneingangRechnung` mit Props `{ open: boolean; onOpenChange: (offen: boolean) => void; categories: Category[]; onGebucht: (info: { zeitpunkt: string; positionen: number }) => void }`.

- [ ] **Step 1: Dialog-Komponente schreiben**

Datei `components/admin/wareneingang-rechnung.tsx`:

```tsx
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
                Rechnung wird gelesen – das dauert etwa eine halbe Minute.
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
```

- [ ] **Step 2: In `wareneingang.tsx` einbinden**

1. Import neben `WareneingangImport` (Zeile ~25) ergänzen:

```tsx
import { WareneingangRechnung } from "@/components/admin/wareneingang-rechnung";
```

   und `FileUp` im bestehenden `lucide-react`-Import ergänzen.

2. State neben `importOffen` (Zeile ~161):

```tsx
const [rechnungOffen, setRechnungOffen] = useState(false);
```

3. Knopf direkt nach dem „Liste einfügen“-Button (Zeile ~926–930) einfügen, gleicher `variant="outline"`:

```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => setRechnungOffen(true)}
>
  <FileUp className="size-4" aria-hidden />
  Rechnung hochladen
</Button>
```

   Falls beide Buttons gleiche Attribute (`size`, `className`) tragen, diese übernehmen.

4. Dialog direkt nach `<WareneingangImport … />` (Zeile ~934–939):

```tsx
<WareneingangRechnung
  open={rechnungOffen}
  onOpenChange={setRechnungOffen}
  categories={categories}
  onGebucht={({ zeitpunkt, positionen }) =>
    setGebucht({ zeitpunkt, positionen, bilder: 0 })
  }
/>
```

- [ ] **Step 3: Lint, Tests, Build**

Run: `npm test 2>&1 | tail -6; npm run lint 2>&1 | grep -E "error|✖"; npm run build 2>&1 | grep -iE "error|failed|Type" | head`
Expected: Tests grün, Lint ohne `error`, Build ohne Fehlermeldung.

- [ ] **Step 4: Im Browser prüfen**

Run: `npm run dev` (Hintergrund), anmelden als Admin, `/admin/bestand` öffnen.
Expected:
1. Knopf „Rechnung hochladen“ steht neben „Liste einfügen“.
2. `Verkaufsrechnung 26080071391.pdf` hochladen: Vorschau zeigt 17 Zeilen „Zugang“, roten Kasten „Diese Rechnung wurde schon gebucht“ und „Buchen“ ist gesperrt, bis „Trotzdem buchen“ angehakt ist. **Nicht buchen.**
3. `Verkaufsrechnung 26040197140.pdf`: eine Rechnung, die schon gebucht ist (heute). Auch hier erscheint der „bereits gebucht“-Kasten mit den 3 Zeilen als „Zugang“. **Nicht buchen.** (Beweist zugleich den Doppelt-Schutz.)
4. Eine Zeile Menge ändern: die Zeile wird rot, „Buchen“ sperrt, Haken „geprüft“ gibt frei.
5. Dialog schließen, Seite lädt normal.

Ist kein Test mit einer ungebuchten Rechnung möglich, den Buchenpfad nicht erzwingen; er läuft über dieselbe Server Action wie der Wareneingang.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wareneingang-rechnung.tsx components/admin/wareneingang.tsx
git commit -m "feat(wareneingang): Rechnung hochladen mit Vorschau, Gegenprobe und Buchen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dokumentation

**Files:**
- Modify: `docs/lager.md` (neuer Abschnitt nach „Sammelimport“, vor „Barcode-Nachschlag beim Wareneingang“)
- Modify: `docs/superpowers/specs/2026-10-08-rechnung-hochladen-design.md` (Zeile „Fotos der Artikel …“ im Abschnitt „Nicht Teil dieser Arbeit“)

- [ ] **Step 1: Abschnitt in `docs/lager.md` einfügen**

Direkt vor der Überschrift `## 🔍 Barcode-Nachschlag beim Wareneingang`:

```markdown
### Rechnung hochladen

`components/admin/wareneingang-rechnung.tsx`, Route
`app/admin/bestand/rechnung/route.ts`, Regeln in `lib/rechnung-import.ts`,
Modellaufruf in `lib/rechnung-lesen.ts`. Vierter Weg neben Scanner,
Namenssuche und Sammelimport – für die Lieferung, die als PDF kommt.

- **Das Modell liest ab, es rechnet nicht.** Preise, Summen und Prüfungen
  entstehen in `lib/rechnung-import.ts` (mit `tests/rechnung-import.test.ts`).
  Eine falsch gelesene Zahl soll an einer Rechenprobe hängen bleiben, nicht im
  Bestand.
- **Erst Vorschau, dann Buchen.** Der Route Handler liest und gleicht ab, er
  bucht nichts. Gebucht wird vom Dialog über `recordStockEntries()` – derselbe
  Weg wie überall im Wareneingang.
- **Gegenproben.** Je Zeile: Menge × Listenpreis × (1 − Rabatt) gegen den
  Zeilenbetrag, 6 Cent Toleranz; nicht aus dem gerundeten Stückpreis (120 ×
  0,98 wären 117,60, die Rechnung sagt 117,72). Über alles: Summe der Zeilen
  gegen „Gesamt ohne MwSt.“ minus Servicegebühr/Versand. Eine rote Zeile oder
  Summenabweichung sperrt „Buchen“, bis sie korrigiert oder bestätigt ist.
- **Doppelt-Schutz.** Steht die Rechnungsnummer schon in einer
  `stock_entries.note`, sperrt die Vorschau (aufhebbar durch „Trotzdem
  buchen“). Die Notiz folgt `Lieferant, Rechnung Nr vom Datum`, so findet der
  Schutz auch Lieferungen, die früher per Skript gebucht wurden.
- **Preise neuer Artikel.** Mit UVP (Iden): Laden = UVP, Großhandel = UVP ÷
  (1 + MwSt aus `company_settings.pos_vat_rate`), Einkauf = Listenpreis ×
  (1 − Rabatt). Ohne UVP (Alpalium): Großhandel = EK × 1,30 auf 10 Cent,
  Laden = EK × 2 auf X,99 – beides aufgerundet, ganzzahlig gerechnet (100 ×
  1,3 ist in Gleitkomma 130,00000000000001 und würde auf 1,40 kippen).
- **Bekannte Artikel** bekommen nur Bestand und Einkaufspreis; Großhandels- und
  Ladenpreis bleiben (`null` heißt „unverändert“).
- **Gleicher Barcode zweimal** heißt eine Zeile mit summierter Menge.
  Zeilen ohne Barcode bleiben getrennt und sind Neuanlagen – die Vorschau
  weist darauf hin, damit ein Artikel, der schon ohne Barcode im Stamm steht,
  nicht doppelt entsteht.
- **PDF bis 4 MB**, geprüft am Dateikopf (`%PDF-`), nicht an Endung oder Typ.
  Route Handler statt Server Action, weil die nur 1 MB Body annimmt.
- **Prüfen an echten PDFs** ohne Browser:
  `scripts/rechnung-lesen-check.mjs` (Aufruf im Kopfkommentar).
```

- [ ] **Step 2: Spec-Zeile korrigieren**

In `docs/superpowers/specs/2026-10-08-rechnung-hochladen-design.md` im Abschnitt „Nicht Teil dieser Arbeit“ den Eintrag „Fotos der Artikel (das macht der Barcode-Nachschlag nach dem Buchen weiter)“ ersetzen durch „Fotos der Artikel (bleiben wie bisher: Wareneingang und `scripts/bilder-auffuellen.mjs`)“.

- [ ] **Step 3: Gesamtprüfung und Commit**

Run: `npm test 2>&1 | tail -6; npm run lint 2>&1 | grep -E "error|✖"; npm run build 2>&1 | grep -iE "error|failed|Type" | head`
Expected: alles grün.

```bash
git add docs/lager.md docs/superpowers/specs/2026-10-08-rechnung-hochladen-design.md
git commit -m "docs(lager): Rechnung hochladen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (gegen die Spec)

- **Ablauf 1–5:** Knopf + Dialog (Task 4), Route (Task 3), Abgleich in einer Abfrage (Task 3), Vorschau-Tabelle mit „Zugang · Bestand x → y“ / „wird angelegt“ (Task 4), Buchen mit Notiz (Task 4). ✔
- **Schema:** Felder aus der Spec in `positionSchema`/`rechnungSchema` (Task 1). Die KI liest nur ab (Prompt, Task 2). ✔
- **Sicherungen:** Gegenprobe Zeile + Summe, Sperre (`gesperrt` in Task 4), Doppelt-Schutz (`findGebuchteRechnung`, Task 3), Zusammenlegen (`fasseZusammen`), Preise 0/fehlend (`ohneGh`, Eh 0 → `null`), Fehlermeldungen (Route + Dialog). ✔
- **Preisregeln:** UVP-Regel, Aufschläge ohne UVP, bekannte Artikel nur EK (Task 1 + Task 4 `unitPrice`/`retailPrice` null). ✔
- **MwSt aus Firmendaten:** `mwstSatz` kommt vom Route Handler (Task 3). ✔
- **Tests:** Gegenproben, Rundung, UVP-Regel, Zusammenlegen, Toleranzen mit Beispielen aus den zwei Rechnungen (Task 1). ✔
- **Prüfung mit echten Rechnungen:** Task 2 Step 3 (Lesen) und Task 4 Step 4 (Dialog, Doppelt-Schutz). ✔
- **Typkonsistenz:** `RechnungAntwort` (Task 1) wird in Route (Task 3) und Dialog (Task 4) identisch genutzt; `leseRechnung`-Signatur (Task 2) passt zum Aufruf in der Route; `onGebucht`-Info `{ zeitpunkt, positionen }` passt zu `setGebucht({ …, bilder: 0 })`.
- **Bekannte Annahme:** Die Modell-ID `anthropic/claude-sonnet-4.5` wird in Task 2 Step 3 an einer echten Anfrage bestätigt und bei Bedarf angepasst.
