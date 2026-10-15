# Bestellablauf-Erweiterung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allgemeine Suche, pflegbare Öffnungszeiten mit Abholtermin-Prüfung, Steuernummer als Pflichtangabe und Zahlart Vorkasse/Rechnung mit Sperre „erst Zahlung, dann Ware".

**Architecture:** Reine Logik (Öffnungszeiten, Steuernummer, Zahlart) steht in `lib/` ohne Server-Importe und ist mit dem Node-Testrunner getestet. Serverseitige Regeln laufen als `BEFORE`-Trigger auf `orders` (Abholzeit, Steuernummer, Zahlungssperre), damit `create_order()` nur dort neu geschrieben wird, wo es unvermeidbar ist (Zahlart). „Bezahlt" heißt: die Rechnung der Bestellung hat `invoices.status = 'paid'` – dieselbe Quelle, die der Admin heute schon über `InvoiceStatusSelect` pflegt.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (Postgres, RLS, RPC), Zod, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-15-bestellablauf-erweiterung-design.md`

## Abweichungen vom Spec (nach Code-Lektüre)

1. **Kein `orders.paid_at`, kein neuer Admin-Knopf.** `invoices.status = 'paid'` und `updateInvoiceStatus` existieren. „Bezahlt" = Rechnung der Bestellung bezahlt. Der Admin-Knopf ist der vorhandene `InvoiceStatusSelect` auf `/admin/orders/[id]`.
2. **`darf_auf_rechnung()` ohne Parameter**, liest `auth.uid()`. Wahr, wenn der Kunde mindestens eine Rechnung mit `status = 'paid'` hat. Kein Parameter = kein fremder Kunde abfragbar.
3. **Steuernummer und Abholzeit als Trigger** statt Änderung in `create_order()`. Die Trigger greifen nur, wenn `NEW.customer_id = auth.uid()` (Kunde bestellt selbst); Admin-Rechnungen für Kunden und Kassenverkäufe bleiben unberührt.
4. **Suche:** `/shop?q=` wirkt schon (`parseShopFilters` → `filters.search`, Besucher und Kunden). Es fehlen nur die Einstiegspunkte in Kopfleiste, Klappmenü und Startseite.
5. **Öffnungszeiten für Besucher** über eine eigene RPC `public_opening_hours()`; `public_company_contact()` bleibt unangetastet (Rückgabetyp wäre nur per DROP änderbar).

## Global Constraints

- Öffnungszeiten (Vorbelegung): Mo 11:00–18:30, Di geschlossen, Mi–Fr 11:00–18:30, Sa/So 11:00–19:00.
- Zeitzone für alle Öffnungszeitenprüfungen: `Europe/Berlin` (DB: `public.pos_zeitzone()`).
- Steuernummer-Prüfung nur Format, keine Online-Abfrage.
- Datenbankänderungen nur als neue idempotente Migration, nächste freie Nummer; bestehende nicht ändern. Dieses Vorhaben: 071, 072, 073.
- Gebucht und geprüft wird in der Datenbank, nicht im Browser; der Browser zeigt nur an.
- Zahlenfelder nur über `NumericInput` / `QuantityInput`.
- Kein KI-Look: Klassisch-professionell, Farbvariablen aus `app/globals.css`, keine neuen Effekte.
- Kassenportal (`/kasse`) wird nicht erweitert.
- Vor jedem Commit: `npm test`, `npm run lint`, `npm run build`, `npm run check:migrations`.
- Commit-Nachrichten enden mit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Dateiübersicht

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `components/site-search.tsx` | neu | GET-Formular nach `/shop?q=` (Varianten `leiste`, `gross`, `menue`) |
| `components/header.tsx` | ändern | Suchfeld in der Kopfleiste |
| `components/mobile-nav.tsx` | ändern | Suchfeld im Klappmenü |
| `app/page.tsx` | ändern | großes Suchfeld unter der Schnellleiste |
| `lib/oeffnungszeiten.ts` | neu | Typen, Parser, `istGeoeffnet`, Formatierung, JSON-LD-Spec |
| `tests/oeffnungszeiten.test.ts` | neu | Tests dazu |
| `supabase/migrations/071_oeffnungszeiten.sql` | neu | Spalte, RPC, Abholzeit-Trigger |
| `lib/queries/oeffnungszeiten.ts` | neu | `getOeffnungszeiten()` (anon-fähig), `getOeffnungszeitenAdmin()` |
| `lib/actions/admin-oeffnungszeiten.ts` | neu | Speichern mit Zod |
| `components/forms/oeffnungszeiten-form.tsx` | neu | 7 Zeilen, Zeiten + „geschlossen" |
| `app/admin/settings/oeffnungszeiten/page.tsx` | neu | Seite im Einstellungsmenü |
| `app/admin/settings/layout.tsx` | ändern | Menüeintrag |
| `components/oeffnungszeiten-liste.tsx` | neu | Anzeige als Zeilenliste |
| `app/kontakt/page.tsx`, `components/footer.tsx`, `lib/faq.tsx`, `components/structured-data.tsx`, `app/page.tsx` | ändern | Anzeige |
| `lib/steuernummer.ts` | neu | Formatprüfung |
| `tests/steuernummer.test.ts` | neu | Tests dazu |
| `lib/profil.ts`, `tests/profil.test.ts`, `lib/profil-ziel.ts` | ändern | `vat_id` Pflicht |
| `supabase/migrations/073_steuernummer_pflicht.sql` | neu | Trigger |
| `lib/zahlart.ts`, `tests/zahlart.test.ts` | neu | Erlaubte Zahlarten, Überweisungs-Prädikat |
| `supabase/migrations/072_zahlart_vorkasse.sql` | neu | Constraints, `darf_auf_rechnung()`, `create_order()`, Sperr-Trigger |
| `lib/types.ts`, `lib/queries/zahlart.ts`, `lib/actions/orders.ts`, `lib/actions/admin-orders.ts` | ändern/neu | Typ, Abfrage, Aktionen |
| `app/checkout/page.tsx`, `components/forms/checkout-form.tsx` | ändern | Zahlart-Kacheln, Öffnungszeiten, Steuernummer-Sperre |
| `app/orders/[id]/page.tsx`, `lib/emails/*.ts`, `lib/invoice.ts`, `app/admin/orders/[id]/page.tsx` | ändern | Anzeige und Texte |

---

## Task 1: Allgemeine Suche

**Files:**
- Create: `components/site-search.tsx`
- Modify: `components/header.tsx`, `components/mobile-nav.tsx`, `app/page.tsx:225-230`

**Interfaces:**
- Produces: `SiteSearch({ variant, className? })` mit `variant: "leiste" | "gross" | "menue"`. Reines Server-kompatibles Markup (kein State), sendet `GET /shop?q=…`.

Hinweis: Kein Unit-Test – die Komponente ist ein HTML-Formular ohne Logik. Verifikation über Build und Sichtprüfung. Die Suche selbst (`sucheWortweise`) ist schon abgedeckt.

- [ ] **Step 1: Komponente schreiben**

`components/site-search.tsx`:

```tsx
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Allgemeine Artikelsuche. Ein einfaches GET-Formular auf /shop: die Seite
 * liest `q` ohnehin (lib/shop-filters.ts) und sucht wortweise in Name,
 * Artikelnummer und Barcode (lib/search.ts). Funktioniert damit auch ohne
 * JavaScript und für Besucher ohne Konto (Schaufenster, ohne Preise).
 *
 *   leiste – kompakt in der dunklen Kopfleiste
 *   menue  – volle Breite im Klappmenü
 *   gross  – eigenes Band unter der Schnellleiste der Startseite
 */
export function SiteSearch({
  variant,
  className,
}: {
  variant: "leiste" | "gross" | "menue";
  className?: string;
}) {
  const feld = (
    <form action="/shop" method="get" role="search" className="relative w-full">
      <label htmlFor={`suche-${variant}`} className="sr-only">
        Artikel suchen
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-dark-muted"
        aria-hidden
      />
      <input
        id={`suche-${variant}`}
        name="q"
        type="search"
        maxLength={100}
        autoComplete="off"
        placeholder={
          variant === "gross"
            ? "Artikel suchen – Bezeichnung, Artikelnummer oder Barcode"
            : "Artikel suchen"
        }
        className={cn(
          "w-full rounded-md border border-surface-dark-border bg-white/[0.06] pl-9 pr-3 text-surface-dark-foreground placeholder:text-surface-dark-muted focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          variant === "gross" ? "h-12 text-base" : "h-9 text-sm",
        )}
      />
    </form>
  );

  if (variant === "gross") {
    return (
      <div
        className={cn(
          "border-b border-surface-dark-border bg-surface-dark",
          className,
        )}
      >
        <div className="mx-auto max-w-6xl px-4 py-4">{feld}</div>
      </div>
    );
  }

  return <div className={className}>{feld}</div>;
}
```

- [ ] **Step 2: In die Kopfleiste einbauen**

In `components/header.tsx` Import ergänzen und das Feld zwischen `<MainNav links={links} />` und dem rechten Block einsetzen. Für Admins erst ab `xl` (gleiche Begründung wie `erstAbXl` bei den Reitern):

```tsx
import { SiteSearch } from "@/components/site-search";
```

```tsx
        <MainNav links={links} />

        <SiteSearch
          variant="leiste"
          className={isAdmin ? "hidden w-48 xl:block" : "hidden w-44 lg:block xl:w-56"}
        />

        <div className="flex shrink-0 items-center gap-1">
```

- [ ] **Step 3: In das Klappmenü einbauen**

In `components/mobile-nav.tsx` Import `import { SiteSearch } from "@/components/site-search";` ergänzen und direkt vor `<nav className="px-2 py-2">` einfügen:

```tsx
            <div className="border-b border-surface-dark-border px-4 py-3">
              <SiteSearch variant="menue" />
            </div>

            <nav className="px-2 py-2">
```

(`SiteSearch` hat kein `"use client"`, ist aber ohne State und deshalb in einer Client Component importierbar; ein Seitenwechsel schließt das Menü bereits über `usePathname`.)

- [ ] **Step 4: Auf der Startseite einbauen**

In `app/page.tsx` Import `import { SiteSearch } from "@/components/site-search";` ergänzen. Zwischen dem `<Schnellleiste … />`-Aufruf (Zeile ~225) und `<section className="relative isolate overflow-hidden bg-surface-dark …">` (Zeile ~230) einfügen:

```tsx
      <SiteSearch variant="gross" />
```

- [ ] **Step 5: Verifikation**

Run: `npm run lint && npm run build`
Expected: beide ohne Fehler.

Run: `npm run dev` und im Browser prüfen: Startseite zeigt das Band, „kabel 2m" im Feld → `/shop?q=kabel+2m` zeigt Treffer; im Inkognito-Fenster (ohne Login) dasselbe, ohne Preise; Handy-Breite (< 1024 px): Feld im Klappmenü.

- [ ] **Step 6: Commit**

```bash
git add components/site-search.tsx components/header.tsx components/mobile-nav.tsx app/page.tsx
git commit -m "feat(suche): allgemeine Suche in Kopfleiste, Klappmenü und Startseite

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Öffnungszeiten – Logik

**Files:**
- Create: `lib/oeffnungszeiten.ts`, `tests/oeffnungszeiten.test.ts`

**Interfaces:**
- Produces:
  - `type Zeitfenster = { open: string; close: string }` (`"HH:MM"`)
  - `type Oeffnungszeiten = (Zeitfenster | null)[]` (7 Einträge, 0 = Montag)
  - `const STANDARD_OEFFNUNGSZEITEN: Oeffnungszeiten`
  - `parseOeffnungszeiten(roh: unknown): Oeffnungszeiten`
  - `istGeoeffnet(zeitpunkt: Date, zeiten: Oeffnungszeiten, zone?: string): boolean` (Öffnung und Schluss inklusive)
  - `formatOeffnungszeiten(zeiten: Oeffnungszeiten): string[]`
  - `openingHoursSpecification(zeiten): { "@type": "OpeningHoursSpecification"; dayOfWeek: string[]; opens: string; closes: string }[]`
  - `const WOCHENTAGE: readonly string[]`, `const WOCHENTAGE_KURZ: readonly string[]`

- [ ] **Step 1: Failing Tests schreiben**

`tests/oeffnungszeiten.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDARD_OEFFNUNGSZEITEN,
  formatOeffnungszeiten,
  istGeoeffnet,
  openingHoursSpecification,
  parseOeffnungszeiten,
} from "@/lib/oeffnungszeiten";

// 2026: Sommerzeit bis 25.10. (UTC+2), danach Winterzeit (UTC+1).
// 12.10. Mo, 13.10. Di, 14.10. Mi, 17.10. Sa, 04.11. Mi.

test("Vorbelegung: Mo, Mi–Fr 11:00–18:30, Di zu, Sa/So 11:00–19:00", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  assert.equal(z.length, 7);
  assert.deepEqual(z[0], { open: "11:00", close: "18:30" });
  assert.equal(z[1], null);
  assert.deepEqual(z[4], { open: "11:00", close: "18:30" });
  assert.deepEqual(z[5], { open: "11:00", close: "19:00" });
  assert.deepEqual(z[6], { open: "11:00", close: "19:00" });
});

test("Mittwoch 12:00 Berlin (Sommerzeit) ist geöffnet", () => {
  assert.equal(istGeoeffnet(new Date("2026-10-14T10:00:00Z"), STANDARD_OEFFNUNGSZEITEN), true);
});

test("Dienstag ist geschlossen", () => {
  assert.equal(istGeoeffnet(new Date("2026-10-13T10:00:00Z"), STANDARD_OEFFNUNGSZEITEN), false);
});

test("Öffnung und Schluss gelten inklusive, davor und danach nicht", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  // Montag 11:00 Berlin = 09:00Z, 10:59 = 08:59Z, 18:30 = 16:30Z, 18:31 = 16:31Z
  assert.equal(istGeoeffnet(new Date("2026-10-12T09:00:00Z"), z), true);
  assert.equal(istGeoeffnet(new Date("2026-10-12T08:59:00Z"), z), false);
  assert.equal(istGeoeffnet(new Date("2026-10-12T16:30:00Z"), z), true);
  assert.equal(istGeoeffnet(new Date("2026-10-12T16:31:00Z"), z), false);
});

test("Samstag gilt bis 19:00", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  assert.equal(istGeoeffnet(new Date("2026-10-17T16:45:00Z"), z), true); // 18:45
  assert.equal(istGeoeffnet(new Date("2026-10-17T17:01:00Z"), z), false); // 19:01
});

test("Winterzeit: Mittwoch 11:00 Berlin = 10:00Z", () => {
  const z = STANDARD_OEFFNUNGSZEITEN;
  assert.equal(istGeoeffnet(new Date("2026-11-04T10:00:00Z"), z), true);
  assert.equal(istGeoeffnet(new Date("2026-11-04T09:59:00Z"), z), false);
});

test("formatOeffnungszeiten fasst gleiche Zeiten zusammen", () => {
  assert.deepEqual(formatOeffnungszeiten(STANDARD_OEFFNUNGSZEITEN), [
    "Mo, Mi–Fr 11:00–18:30 Uhr",
    "Di geschlossen",
    "Sa, So 11:00–19:00 Uhr",
  ]);
});

test("formatOeffnungszeiten: alle Tage gleich", () => {
  const z = Array.from({ length: 7 }, () => ({ open: "09:00", close: "17:00" }));
  assert.deepEqual(formatOeffnungszeiten(z), ["Mo–So 09:00–17:00 Uhr"]);
});

test("parseOeffnungszeiten fällt bei Müll auf die Vorbelegung zurück", () => {
  assert.deepEqual(parseOeffnungszeiten(null), STANDARD_OEFFNUNGSZEITEN);
  assert.deepEqual(parseOeffnungszeiten("kaputt"), STANDARD_OEFFNUNGSZEITEN);
  assert.deepEqual(parseOeffnungszeiten([1, 2, 3]), STANDARD_OEFFNUNGSZEITEN);
});

test("parseOeffnungszeiten verwirft Zeiten mit schlechtem Format oder open >= close", () => {
  const roh = [
    { open: "11:00", close: "18:30" },
    { open: "25:00", close: "18:30" },
    { open: "18:30", close: "11:00" },
    null,
    { open: "11:00", close: "18:30" },
    { open: "11:00", close: "19:00" },
    { open: "11:00", close: "19:00" },
  ];
  const z = parseOeffnungszeiten(roh);
  assert.deepEqual(z[0], { open: "11:00", close: "18:30" });
  assert.equal(z[1], null);
  assert.equal(z[2], null);
  assert.equal(z[3], null);
});

test("openingHoursSpecification: ein Eintrag je Zeitfenster, englische Tage", () => {
  const spec = openingHoursSpecification(STANDARD_OEFFNUNGSZEITEN);
  assert.equal(spec.length, 2);
  assert.deepEqual(spec[0].dayOfWeek, ["Monday", "Wednesday", "Thursday", "Friday"]);
  assert.equal(spec[0].opens, "11:00");
  assert.equal(spec[0].closes, "18:30");
  assert.deepEqual(spec[1].dayOfWeek, ["Saturday", "Sunday"]);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL – `Cannot find module '…/lib/oeffnungszeiten.ts'`.

- [ ] **Step 3: Implementierung**

`lib/oeffnungszeiten.ts`:

```ts
/**
 * Öffnungszeiten des Ladens (company_settings.opening_hours, Migration 071).
 *
 * Reine Funktionen ohne Server-Importe: Checkout (Browser), Kontaktseite und
 * Admin-Formular rechnen mit denselben Regeln wie der Trigger
 * orders_abholzeit_pruefen() in der Datenbank – Index 0 ist Montag, Zeiten
 * gelten in Europe/Berlin, Öffnung und Schluss inklusive.
 */

export interface Zeitfenster {
  open: string;
  close: string;
}

/** Sieben Einträge, 0 = Montag … 6 = Sonntag; null = geschlossen. */
export type Oeffnungszeiten = (Zeitfenster | null)[];

export const WOCHENTAGE = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

const SCHEMA_TAGE = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const LADEN_ZEITZONE = "Europe/Berlin";

export const STANDARD_OEFFNUNGSZEITEN: Oeffnungszeiten = [
  { open: "11:00", close: "18:30" },
  null,
  { open: "11:00", close: "18:30" },
  { open: "11:00", close: "18:30" },
  { open: "11:00", close: "18:30" },
  { open: "11:00", close: "19:00" },
  { open: "11:00", close: "19:00" },
];

const ZEIT = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minuten(zeit: string): number {
  const m = ZEIT.exec(zeit);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function gueltigesFenster(wert: unknown): Zeitfenster | null {
  if (!wert || typeof wert !== "object") return null;
  const { open, close } = wert as Record<string, unknown>;
  if (typeof open !== "string" || typeof close !== "string") return null;
  if (!ZEIT.test(open) || !ZEIT.test(close)) return null;
  if (minuten(open) >= minuten(close)) return null;
  return { open, close };
}

/**
 * JSON aus der Datenbank → sieben Einträge. Ein kaputter Gesamtwert (kein
 * Array mit sieben Einträgen) fällt auf die Vorbelegung zurück; ein einzelner
 * kaputter Tag gilt als geschlossen – lieber zu wenig versprochen als ein
 * Zeitfenster erfunden.
 */
export function parseOeffnungszeiten(roh: unknown): Oeffnungszeiten {
  if (!Array.isArray(roh) || roh.length !== 7) return STANDARD_OEFFNUNGSZEITEN;
  return roh.map((tag) => gueltigesFenster(tag));
}

function berlinTeile(zeitpunkt: Date, zone: string): { tag: number; minuten: number } {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(zeitpunkt)
      .map((teil) => [teil.type, teil.value]),
  );
  const tag = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(teile.weekday);
  return { tag, minuten: Number(teile.hour) * 60 + Number(teile.minute) };
}

/** Liegt der Zeitpunkt innerhalb der Öffnungszeiten? Öffnung und Schluss zählen mit. */
export function istGeoeffnet(
  zeitpunkt: Date,
  zeiten: Oeffnungszeiten,
  zone: string = LADEN_ZEITZONE,
): boolean {
  if (Number.isNaN(zeitpunkt.getTime())) return false;
  const { tag, minuten: m } = berlinTeile(zeitpunkt, zone);
  const fenster = zeiten[tag];
  if (!fenster) return false;
  return m >= minuten(fenster.open) && m <= minuten(fenster.close);
}

/** Tage als „Mo, Mi–Fr": Läufe ab drei Tagen mit Strich, sonst mit Komma. */
function tageText(tage: number[]): string {
  const laeufe: number[][] = [];
  for (const tag of tage) {
    const letzter = laeufe.at(-1);
    if (letzter && letzter.at(-1) === tag - 1) letzter.push(tag);
    else laeufe.push([tag]);
  }
  return laeufe
    .map((lauf) =>
      lauf.length >= 3
        ? `${WOCHENTAGE_KURZ[lauf[0]]}–${WOCHENTAGE_KURZ[lauf.at(-1)!]}`
        : lauf.map((t) => WOCHENTAGE_KURZ[t]).join(", "),
    )
    .join(", ");
}

/** Anzeigezeilen, gleiche Zeiten zusammengefasst, Reihenfolge nach erstem Tag. */
export function formatOeffnungszeiten(zeiten: Oeffnungszeiten): string[] {
  const gruppen = new Map<string, number[]>();
  zeiten.forEach((fenster, tag) => {
    const schluessel = fenster ? `${fenster.open}–${fenster.close}` : "zu";
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), tag]);
  });
  return [...gruppen.entries()].map(([schluessel, tage]) =>
    schluessel === "zu"
      ? `${tageText(tage)} geschlossen`
      : `${tageText(tage)} ${schluessel} Uhr`,
  );
}

/** schema.org-Angabe für die Startseite (components/structured-data.tsx). */
export function openingHoursSpecification(zeiten: Oeffnungszeiten): {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}[] {
  const gruppen = new Map<string, number[]>();
  zeiten.forEach((fenster, tag) => {
    if (!fenster) return;
    const schluessel = `${fenster.open}|${fenster.close}`;
    gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), tag]);
  });
  return [...gruppen.entries()].map(([schluessel, tage]) => {
    const [opens, closes] = schluessel.split("|");
    return {
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: tage.map((t) => SCHEMA_TAGE[t]),
      opens,
      closes,
    };
  });
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test 2>&1 | grep -E "oeffnungszeiten|^# (pass|fail)"`
Expected: alle Tests aus `oeffnungszeiten.test.ts` grün, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/oeffnungszeiten.ts tests/oeffnungszeiten.test.ts
git commit -m "feat(oeffnungszeiten): Logik und Tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Öffnungszeiten – Migration 071

**Files:**
- Create: `supabase/migrations/071_oeffnungszeiten.sql`

**Interfaces:**
- Produces: Spalte `company_settings.opening_hours JSONB`; RPC `public.public_opening_hours() RETURNS JSONB` (anon + authenticated); Trigger `trg_orders_abholzeit` auf `orders` (BEFORE INSERT).

- [ ] **Step 1: Migration schreiben**

`supabase/migrations/071_oeffnungszeiten.sql`:

```sql
-- =============================================================================
-- Migration 071 – Öffnungszeiten
--
-- 1. company_settings.opening_hours: sieben Einträge, Index 0 = Montag, je
--    {"open":"HH:MM","close":"HH:MM"} oder null (geschlossen).
-- 2. public_opening_hours(): dieselbe Angabe für Besucher ohne Konto.
--    company_settings selbst bleibt nur für Angemeldete lesbar;
--    public_company_contact() behält seinen Rückgabetyp.
-- 3. Trigger auf orders: ein Abholtermin, den der Kunde selbst wählt, muss in
--    die Öffnungszeiten fallen (Europe/Berlin, Öffnung und Schluss inklusive).
--    Als Trigger statt in create_order(), damit die Regel nicht an einer
--    Funktion hängt, die in 004, 029, 037, 049, 054 und 059 schon sechsmal
--    ersetzt wurde. Greift nur, wenn der Kunde für sich selbst bestellt –
--    Rechnungen, die der Admin für einen Kunden anlegt, bleiben unberührt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS opening_hours JSONB NOT NULL DEFAULT
  '[{"open":"11:00","close":"18:30"},null,{"open":"11:00","close":"18:30"},
    {"open":"11:00","close":"18:30"},{"open":"11:00","close":"18:30"},
    {"open":"11:00","close":"19:00"},{"open":"11:00","close":"19:00"}]'::jsonb;

COMMENT ON COLUMN public.company_settings.opening_hours IS
  'Öffnungszeiten je Wochentag (0 = Montag), null = geschlossen. Zeiten in Europe/Berlin.';

CREATE OR REPLACE FUNCTION public.public_opening_hours()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT opening_hours FROM public.company_settings WHERE id;
$$;

REVOKE ALL ON FUNCTION public.public_opening_hours() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_opening_hours() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_abholzeit_pruefen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_lokal TIMESTAMP;
  v_tag   INT;
  v_zeit  TIME;
  v_slot  JSONB;
BEGIN
  IF NEW.delivery_method <> 'pickup' OR NEW.pickup_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  v_lokal := NEW.pickup_at AT TIME ZONE public.pos_zeitzone();
  v_tag   := EXTRACT(ISODOW FROM v_lokal)::INT - 1;
  v_zeit  := v_lokal::TIME;

  SELECT opening_hours -> v_tag INTO v_slot
  FROM public.company_settings
  WHERE id;

  -- Keine Firmendaten-Zeile: nichts zu prüfen.
  IF v_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(v_slot) = 'null' THEN
    RAISE EXCEPTION 'An diesem Tag ist geschlossen. Bitte wählen Sie einen anderen Abholtermin.';
  END IF;

  IF v_zeit < (v_slot ->> 'open')::TIME OR v_zeit > (v_slot ->> 'close')::TIME THEN
    RAISE EXCEPTION 'Abholung nur zu unseren Öffnungszeiten (% bis % Uhr).',
      to_char((v_slot ->> 'open')::TIME, 'HH24:MI'),
      to_char((v_slot ->> 'close')::TIME, 'HH24:MI');
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_abholzeit ON public.orders;
CREATE TRIGGER trg_orders_abholzeit
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_abholzeit_pruefen();
```

- [ ] **Step 2: Migrations-Check**

Run: `npm run check:migrations`
Expected: `Migrationen in Ordnung: 71 Dateien, letzte 071_oeffnungszeiten.sql`

- [ ] **Step 3: Migration einspielen (Betreiber)**

Den Inhalt im Supabase SQL-Editor ausführen. Prüfen:

```sql
SELECT public.public_opening_hours();
-- Erwartet: Array mit 7 Einträgen, Index 1 = null
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/071_oeffnungszeiten.sql
git commit -m "feat(oeffnungszeiten): Migration 071 – Spalte, öffentliche RPC, Abholzeit-Trigger

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Öffnungszeiten – Abfragen und Admin-Pflege

**Files:**
- Create: `lib/queries/oeffnungszeiten.ts`, `lib/actions/admin-oeffnungszeiten.ts`, `components/forms/oeffnungszeiten-form.tsx`, `app/admin/settings/oeffnungszeiten/page.tsx`
- Modify: `app/admin/settings/layout.tsx`

**Interfaces:**
- Consumes: `parseOeffnungszeiten`, `Oeffnungszeiten`, `WOCHENTAGE` (Task 2); RPC `public_opening_hours` (Task 3).
- Produces: `getOeffnungszeiten(): Promise<Oeffnungszeiten>` (auch ohne Sitzung), Server Action `updateOeffnungszeiten(prev: AdminFormState, formData: FormData): Promise<AdminFormState>`.

- [ ] **Step 1: Abfrage**

`lib/queries/oeffnungszeiten.ts`:

```ts
import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import {
  parseOeffnungszeiten,
  STANDARD_OEFFNUNGSZEITEN,
  type Oeffnungszeiten,
} from "@/lib/oeffnungszeiten";

/**
 * Öffnungszeiten für jede Seite, auch ohne Sitzung (RPC aus Migration 071).
 * Fehlt die Funktion noch, gilt die Vorbelegung – die Seiten zeigen dann
 * dieselben Zeiten, die die Migration ohnehin einträgt.
 */
export async function getOeffnungszeiten(): Promise<Oeffnungszeiten> {
  const { data, error } = await createPublicClient().rpc("public_opening_hours");
  if (error) {
    console.error("[einstellungen] Öffnungszeiten:", error.message);
    return STANDARD_OEFFNUNGSZEITEN;
  }
  return parseOeffnungszeiten(data);
}
```

- [ ] **Step 2: Server Action**

`lib/actions/admin-oeffnungszeiten.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { WOCHENTAGE, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

const tagSchema = z.object({
  geschlossen: z.boolean(),
  open: z.string(),
  close: z.string(),
});

export async function updateOeffnungszeiten(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const tage = WOCHENTAGE.map((_, i) =>
    tagSchema.parse({
      geschlossen: formData.get(`tag${i}_zu`) === "on",
      open: String(formData.get(`tag${i}_open`) ?? ""),
      close: String(formData.get(`tag${i}_close`) ?? ""),
    }),
  );

  const wert: Oeffnungszeiten = [];
  for (const [i, tag] of tage.entries()) {
    if (tag.geschlossen) {
      wert.push(null);
      continue;
    }
    if (!ZEIT.test(tag.open) || !ZEIT.test(tag.close)) {
      return { error: `${WOCHENTAGE[i]}: Bitte Zeiten im Format HH:MM angeben.` };
    }
    if (tag.open >= tag.close) {
      return { error: `${WOCHENTAGE[i]}: Öffnung muss vor Schluss liegen.` };
    }
    wert.push({ open: tag.open, close: tag.close });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({ opening_hours: wert })
    .eq("id", true);

  if (error?.code === "PGRST204" || error?.code === "42703") {
    return {
      error:
        "Die Tabelle kennt Öffnungszeiten noch nicht. Bitte supabase/migrations/071_oeffnungszeiten.sql im Supabase SQL-Editor ausführen.",
    };
  }
  if (error) {
    console.error("[admin] Öffnungszeiten speichern:", error.message);
    return { error: "Die Öffnungszeiten konnten nicht gespeichert werden." };
  }

  revalidatePath("/", "layout");
  return { success: "Öffnungszeiten gespeichert." };
}
```

- [ ] **Step 3: Formular**

`components/forms/oeffnungszeiten-form.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateOeffnungszeiten } from "@/lib/actions/admin-oeffnungszeiten";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { WOCHENTAGE, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Öffnungszeiten speichern"}
    </Button>
  );
}

const zeitfeld =
  "h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40";

export function OeffnungszeitenForm({ zeiten }: { zeiten: Oeffnungszeiten }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateOeffnungszeiten,
    {},
  );
  const [zu, setZu] = useState(() => zeiten.map((tag) => tag === null));

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {WOCHENTAGE.map((name, i) => (
          <li
            key={name}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <span className="w-28 text-sm font-medium">{name}</span>
            <input
              type="time"
              name={`tag${i}_open`}
              defaultValue={zeiten[i]?.open ?? "11:00"}
              disabled={zu[i]}
              aria-label={`${name} von`}
              className={zeitfeld}
            />
            <span className="text-sm text-muted-foreground">bis</span>
            <input
              type="time"
              name={`tag${i}_close`}
              defaultValue={zeiten[i]?.close ?? "18:30"}
              disabled={zu[i]}
              aria-label={`${name} bis`}
              className={zeitfeld}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={`tag${i}_zu`}
                name={`tag${i}_zu`}
                checked={zu[i]}
                onCheckedChange={(c) =>
                  setZu((alt) => alt.map((w, j) => (j === i ? c === true : w)))
                }
              />
              <Label htmlFor={`tag${i}_zu`} className="font-normal">
                geschlossen
              </Label>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Die Zeiten gelten für die Anzeige im Shop und für die Wahl des
        Abholtermins. Ein Abholtermin außerhalb dieser Zeiten wird abgewiesen.
      </p>
      <SaveButton />
    </form>
  );
}
```

Hinweis: Deaktivierte `<input>`-Felder werden nicht mitgesendet; die Action liest sie nur, wenn der Tag nicht `geschlossen` ist (der Wert fehlt sonst → `""`, was bei `geschlossen` nicht geprüft wird).

- [ ] **Step 4: Seite und Menüeintrag**

`app/admin/settings/oeffnungszeiten/page.tsx`:

```tsx
import type { Metadata } from "next";
import { OeffnungszeitenForm } from "@/components/forms/oeffnungszeiten-form";
import { getOeffnungszeiten } from "@/lib/queries/oeffnungszeiten";

export const metadata: Metadata = { title: "Öffnungszeiten" };

export default async function Seite() {
  const zeiten = await getOeffnungszeiten();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Öffnungszeiten</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Erscheinen auf Kontaktseite, Fußzeile und im Bestellformular. Zur
        Abholung lassen sich nur Termine innerhalb dieser Zeiten wählen.
      </p>
      <div className="mt-6">
        <OeffnungszeitenForm zeiten={zeiten} />
      </div>
    </div>
  );
}
```

In `app/admin/settings/layout.tsx` nach dem Eintrag „Firmendaten" einfügen:

```tsx
  {
    href: "/admin/settings/oeffnungszeiten",
    label: "Öffnungszeiten",
    hinweis: "Laden, Abholung",
  },
```

- [ ] **Step 5: Verifikation**

Run: `npm run lint && npm run build`
Expected: ohne Fehler.

Manuell: `/admin/settings/oeffnungszeiten` zeigt die Vorbelegung, Dienstag ist als „geschlossen" gehakt; Speichern mit Mittwoch „19:00 bis 11:00" zeigt „Mittwoch: Öffnung muss vor Schluss liegen."

- [ ] **Step 6: Commit**

```bash
git add lib/queries/oeffnungszeiten.ts lib/actions/admin-oeffnungszeiten.ts components/forms/oeffnungszeiten-form.tsx app/admin/settings/oeffnungszeiten/page.tsx app/admin/settings/layout.tsx
git commit -m "feat(oeffnungszeiten): Pflege unter /admin/settings/oeffnungszeiten

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Öffnungszeiten – Anzeige und Abholtermin im Checkout

**Files:**
- Create: `components/oeffnungszeiten-liste.tsx`
- Modify: `app/kontakt/page.tsx`, `components/footer.tsx`, `lib/faq.tsx:179,214`, `components/structured-data.tsx`, `app/page.tsx`, `app/checkout/page.tsx`, `components/forms/checkout-form.tsx`

**Interfaces:**
- Consumes: `getOeffnungszeiten`, `formatOeffnungszeiten`, `istGeoeffnet`, `openingHoursSpecification`, `Oeffnungszeiten`.
- Produces: `OeffnungszeitenListe({ zeiten, className? })`; Prop `oeffnungszeiten: Oeffnungszeiten` an `CheckoutForm`.

- [ ] **Step 1: Listenkomponente**

`components/oeffnungszeiten-liste.tsx`:

```tsx
import { formatOeffnungszeiten, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";

/** Öffnungszeiten als Zeilenliste, gleiche Zeiten zusammengefasst. */
export function OeffnungszeitenListe({
  zeiten,
  className,
}: {
  zeiten: Oeffnungszeiten;
  className?: string;
}) {
  return (
    <ul className={className}>
      {formatOeffnungszeiten(zeiten).map((zeile) => (
        <li key={zeile} className="tabular">
          {zeile}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Kontaktseite**

In `app/kontakt/page.tsx`: Imports `import { Clock } from "lucide-react";` zu den vorhandenen lucide-Imports ergänzen, außerdem

```tsx
import { OeffnungszeitenListe } from "@/components/oeffnungszeiten-liste";
import { getOeffnungszeiten } from "@/lib/queries/oeffnungszeiten";
```

In `KontaktPage` neben `getPublicContact()` laden (`const zeiten = await getOeffnungszeiten();`) und nach der Zeile „Anschrift und Abholung" einfügen:

```tsx
        <Zeile icon={<Clock className="size-4" aria-hidden />} label="Öffnungszeiten">
          <OeffnungszeitenListe zeiten={zeiten} />
        </Zeile>
```

- [ ] **Step 3: Fußzeile**

`components/footer.tsx` lesen, die Spalte mit Telefon/E-Mail/Anschrift finden und darunter dieselbe Liste einsetzen, mit Überschrift „Öffnungszeiten" im Stil der übrigen Spaltenüberschriften. Die Fußzeile ist eine Server Component; `getOeffnungszeiten()` dort direkt `await`en (Footer lädt `getPublicContact()` schon auf dieselbe Art).

- [ ] **Step 4: FAQ-Texte**

In `lib/faq.tsx` Zeile 214 ersetzen:

```ts
"Ja. Wählen Sie im Bestellformular „Abholung“ und auf Wunsch einen Termin – frühestens am nächsten Tag, innerhalb unserer Öffnungszeiten (siehe Kontakt), damit wir in Ruhe kommissionieren können. Sobald die Ware bereitsteht, bekommen Sie eine E-Mail.",
```

- [ ] **Step 5: JSON-LD**

In `components/structured-data.tsx`: Import `openingHoursSpecification, type Oeffnungszeiten` aus `@/lib/oeffnungszeiten`; Signatur `StructuredData({ firma, zeiten }: { firma: PublicContact; zeiten?: Oeffnungszeiten })`; im Objekt neben `telephone` ergänzen:

```ts
    openingHoursSpecification: zeiten ? openingHoursSpecification(zeiten) : undefined,
```

Den Kommentar „Öffnungszeiten stehen bewusst nicht drin, solange sie nirgends gepflegt sind." ersetzen durch „Öffnungszeiten kommen aus company_settings.opening_hours (Migration 071)."

In `app/page.tsx`: `getOeffnungszeiten()` zu den parallelen Ladevorgängen (dort steht `getPublicContact()` bei Zeile ~99) ergänzen und `<StructuredData firma={firma} zeiten={zeiten} />` aufrufen.

- [ ] **Step 6: Checkout – Termin prüfen**

`app/checkout/page.tsx`: Import `getOeffnungszeiten`; in das `Promise.all` aufnehmen und als Prop reichen:

```tsx
  const [company, kondition, zeiten] = await Promise.all([
    getCompanySettings(),
    getMeineKondition(),
    getOeffnungszeiten(),
  ]);
```

```tsx
          oeffnungszeiten={zeiten}
```

`components/forms/checkout-form.tsx`:

Imports:

```tsx
import { formatOeffnungszeiten, istGeoeffnet, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";
```

Prop in der Signatur und im Typ ergänzen: `oeffnungszeiten: Oeffnungszeiten`.

Nach der Zeile `const versand = deliveryMethod === "shipping";` einfügen:

```tsx
  const terminAusserhalb =
    !versand && abholung !== "" && !istGeoeffnet(new Date(abholung), oeffnungszeiten);
```

Den Abholblock (nach `<p className="text-xs text-muted-foreground">Abholbar in der Regel …</p>`) ergänzen:

```tsx
              <ul className="text-xs text-muted-foreground">
                {formatOeffnungszeiten(oeffnungszeiten).map((zeile) => (
                  <li key={zeile}>{zeile}</li>
                ))}
              </ul>
              {terminAusserhalb ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  Dieser Termin liegt außerhalb unserer Öffnungszeiten. Bitte
                  wählen Sie eine Zeit innerhalb der oben genannten.
                </p>
              ) : null}
```

Den Absenden-Knopf sperren: `<SubmitButton disabled={items.length === 0 || terminAusserhalb} />`.

- [ ] **Step 7: Verifikation**

Run: `npm run lint && npm run build`
Expected: ohne Fehler.

Manuell: `/kontakt` zeigt drei Zeilen; im Checkout Abholung wählen, Dienstag 12:00 setzen → Hinweis und gesperrter Knopf; Mittwoch 12:00 → frei. Mit direkt abgesetztem Request (Dienstag) kommt in `createOrder` die Meldung „An diesem Tag ist geschlossen. …" (Trigger aus Migration 071, P0001).

- [ ] **Step 8: Commit**

```bash
git add components/oeffnungszeiten-liste.tsx app/kontakt/page.tsx components/footer.tsx lib/faq.tsx components/structured-data.tsx app/page.tsx app/checkout/page.tsx components/forms/checkout-form.tsx
git commit -m "feat(oeffnungszeiten): Anzeige im Shop, Abholtermin im Checkout prüfen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Steuernummer – Formatprüfung

**Files:**
- Create: `lib/steuernummer.ts`, `tests/steuernummer.test.ts`

**Interfaces:**
- Produces: `pruefeSteuernummer(wert: string): { ok: true; art: "ustid" | "steuernr"; wert: string } | { ok: false; grund: string }`. `wert` ist normalisiert (Leerzeichen und Bindestriche entfernt, USt-IdNr. in Großbuchstaben, Steuernummer mit Schrägstrichen unverändert).

- [ ] **Step 1: Failing Tests**

`tests/steuernummer.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeSteuernummer } from "@/lib/steuernummer";

test("deutsche USt-IdNr.", () => {
  assert.deepEqual(pruefeSteuernummer("DE123456789"), {
    ok: true,
    art: "ustid",
    wert: "DE123456789",
  });
});

test("USt-IdNr. mit Leerzeichen und Kleinbuchstaben wird normalisiert", () => {
  const r = pruefeSteuernummer(" de 123 456 789 ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.wert, "DE123456789");
});

test("deutsche USt-IdNr. mit falscher Länge wird abgewiesen", () => {
  assert.equal(pruefeSteuernummer("DE12345678").ok, false);
  assert.equal(pruefeSteuernummer("DE1234567890").ok, false);
});

test("EU-USt-IdNr. anderer Länder", () => {
  assert.equal(pruefeSteuernummer("ATU12345678").ok, true);
  assert.equal(pruefeSteuernummer("NL123456789B01").ok, true);
  assert.equal(pruefeSteuernummer("FR12345678901").ok, true);
});

test("deutsche Steuernummer mit und ohne Schrägstriche", () => {
  const a = pruefeSteuernummer("30/123/45678");
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.art, "steuernr");
  assert.equal(pruefeSteuernummer("3012345678").ok, true);
  assert.equal(pruefeSteuernummer("12345678901").ok, true);
  assert.equal(pruefeSteuernummer("1234567890123").ok, true);
});

test("zu kurze oder zu lange Ziffernfolgen sind keine Steuernummer", () => {
  assert.equal(pruefeSteuernummer("123456789").ok, false);
  assert.equal(pruefeSteuernummer("12345678901234").ok, false);
});

test("leer und Text", () => {
  const leer = pruefeSteuernummer("   ");
  assert.equal(leer.ok, false);
  if (!leer.ok) assert.match(leer.grund, /fehlt/);
  assert.equal(pruefeSteuernummer("keine").ok, false);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npm test 2>&1 | grep -E "steuernummer|Cannot find"`
Expected: `Cannot find module '…/lib/steuernummer.ts'`.

- [ ] **Step 3: Implementierung**

`lib/steuernummer.ts`:

```ts
/**
 * Formatprüfung für USt-IdNr. und deutsche Steuernummer.
 *
 * Nur das Format, keine Abfrage beim BZSt/VIES: eine Online-Prüfung bräuchte
 * einen externen Dienst und scheiterte an dessen Ausfällen genau dann, wenn
 * ein Kunde bestellen will. Die Prüfung soll Tippfehler und Leerangaben
 * fangen, nicht Betrug erkennen.
 *
 * Reine Funktion ohne Server-Importe: Konto-Formular, Checkout und Actions
 * rufen dieselbe Stelle.
 */

export type SteuernummerErgebnis =
  | { ok: true; art: "ustid" | "steuernr"; wert: string }
  | { ok: false; grund: string };

export function pruefeSteuernummer(eingabe: string): SteuernummerErgebnis {
  const roh = eingabe.trim();
  if (!roh) {
    return { ok: false, grund: "Die USt-IdNr. oder Steuernummer fehlt." };
  }

  // Leerzeichen, Bindestriche und Punkte sind Lesehilfen, kein Inhalt.
  const ohne = roh.replace(/[\s.-]/g, "").toUpperCase();

  if (/^DE\d{9}$/.test(ohne)) {
    return { ok: true, art: "ustid", wert: ohne };
  }
  if (/^DE/.test(ohne)) {
    return {
      ok: false,
      grund: "Deutsche USt-IdNr.: DE gefolgt von genau 9 Ziffern.",
    };
  }

  // Ländercode + 2–12 Zeichen, davon mindestens eine Ziffer: ohne die
  // Bedingung ginge ein Wort wie „keine" als USt-IdNr. durch.
  if (/^[A-Z]{2}(?=[A-Z0-9]*\d)[A-Z0-9]{2,12}$/.test(ohne)) {
    return { ok: true, art: "ustid", wert: ohne };
  }

  // Deutsche Steuernummer: 10 bis 13 Ziffern, je nach Bundesland mit
  // Schrägstrichen gegliedert (30/123/45678).
  const ziffern = ohne.replace(/\//g, "");
  if (/^[\d/]+$/.test(ohne) && /^\d{10,13}$/.test(ziffern)) {
    return { ok: true, art: "steuernr", wert: ohne };
  }

  return {
    ok: false,
    grund:
      "Bitte eine gültige USt-IdNr. (z. B. DE123456789) oder deutsche Steuernummer (z. B. 30/123/45678) angeben.",
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test 2>&1 | grep -E "steuernummer|^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/steuernummer.ts tests/steuernummer.test.ts
git commit -m "feat(steuernummer): Formatprüfung für USt-IdNr. und Steuernummer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Steuernummer – Pflichtangabe in Profil, Formularen, Actions und Datenbank

**Files:**
- Modify: `lib/profil.ts`, `tests/profil.test.ts`, `lib/profil-ziel.ts`, `lib/actions/account.ts`, `lib/actions/admin-customers.ts`, `components/forms/account-forms.tsx`, `components/forms/profile-complete-form.tsx`, `components/forms/customer-form.tsx`, `app/checkout/page.tsx`
- Create: `supabase/migrations/073_steuernummer_pflicht.sql`

**Interfaces:**
- Consumes: `pruefeSteuernummer` (Task 6).
- Produces: `profilLuecken()` meldet zusätzlich `"USt-IdNr. / Steuernummer"`; `ProfilFelder.vat_id`; DB-Trigger `trg_orders_steuernummer`.

- [ ] **Step 1: Tests anpassen (failing)**

`tests/profil.test.ts` ersetzen durch:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { profilLuecken } from "@/lib/profil";

const voll = {
  full_name: "Max Muster",
  company_name: "Muster GmbH",
  billing_street: "Hauptstr. 1",
  billing_zip: "10115",
  billing_city: "Berlin",
  vat_id: "DE123456789",
};

test("vollständiges Profil hat keine Lücken", () => {
  assert.deepEqual(profilLuecken(voll), []);
});

test("fehlende und leere Angaben werden benannt", () => {
  assert.deepEqual(
    profilLuecken({ ...voll, company_name: null, billing_zip: "  ", billing_city: undefined }),
    ["Firma", "PLZ", "Ort"],
  );
});

test("ohne USt-IdNr. / Steuernummer fehlt die Pflichtangabe", () => {
  assert.deepEqual(profilLuecken({ ...voll, vat_id: null }), [
    "USt-IdNr. / Steuernummer",
  ]);
  assert.deepEqual(profilLuecken({ ...voll, vat_id: "  " }), [
    "USt-IdNr. / Steuernummer",
  ]);
});

test("ungültiges Format zählt als Lücke", () => {
  assert.deepEqual(profilLuecken({ ...voll, vat_id: "keine" }), [
    "USt-IdNr. / Steuernummer",
  ]);
});

test("ganz leeres Profil: alle sechs Pflichtangaben", () => {
  assert.equal(profilLuecken({}).length, 6);
});
```

Run: `npm test 2>&1 | grep -E "profil|fail"` → Expected: FAIL (Tests „ohne USt-IdNr." und „sechs").

- [ ] **Step 2: `lib/profil.ts` ändern**

```ts
import { pruefeSteuernummer } from "@/lib/steuernummer";

export interface ProfilFelder {
  full_name?: string | null;
  company_name?: string | null;
  billing_street?: string | null;
  billing_zip?: string | null;
  billing_city?: string | null;
  vat_id?: string | null;
}

const PFLICHT: [keyof ProfilFelder, string][] = [
  ["full_name", "Ansprechpartner"],
  ["company_name", "Firma"],
  ["billing_street", "Straße und Hausnummer"],
  ["billing_zip", "PLZ"],
  ["billing_city", "Ort"],
];

/** Bezeichnungen der fehlenden Pflichtangaben; leer = Profil vollständig. */
export function profilLuecken(profil: ProfilFelder): string[] {
  const luecken = PFLICHT.filter(([feld]) => !profil[feld]?.trim()).map(
    ([, name]) => name,
  );
  // USt-IdNr. oder Steuernummer: Pflicht und im Format gültig. Ein Wert, den
  // das Konto-Formular nie angenommen hätte (Altbestand), gilt als fehlend.
  if (!pruefeSteuernummer(profil.vat_id ?? "").ok) {
    luecken.push("USt-IdNr. / Steuernummer");
  }
  return luecken;
}
```

Den Kopfkommentar der Datei um einen Satz ergänzen: „Die USt-IdNr. oder Steuernummer steht seit Migration 073 ebenfalls auf der Liste (Format: `lib/steuernummer.ts`)."

Run: `npm test 2>&1 | grep -E "profil|^# fail"` → Expected: `# fail 0`.

- [ ] **Step 3: `lib/profil-ziel.ts` – Spalte mitlesen**

In der Abfrage `.select("role, full_name, company_name, billing_street, billing_zip, billing_city")` die Spalte ergänzen:

```ts
    .select("role, full_name, company_name, billing_street, billing_zip, billing_city, vat_id")
```

(Ohne die Spalte meldete `profilLuecken` nach jedem Login eine Lücke.)

- [ ] **Step 4: Actions prüfen das Format**

`lib/actions/account.ts`: Import `import { pruefeSteuernummer } from "@/lib/steuernummer";`.

- `vervollstaendigenSchema` (Pflicht, die Seite ist nur für Kunden): `vat_id: z.string().trim().max(40).optional(),` ersetzen durch

```ts
  vat_id: z
    .string()
    .trim()
    .max(40)
    .superRefine((wert, ctx) => {
      const r = pruefeSteuernummer(wert);
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.grund });
    }),
```

  In `vervollstaendigeProfil` das Lesen `vat_id: formData.get("vat_id") || undefined,` → `vat_id: formData.get("vat_id") ?? "",` (leer muss als „fehlt" gemeldet werden, nicht als fehlender Typ), und beim Schreiben `vat_id: d.vat_id || null,` → `vat_id: d.vat_id,`. Gespeichert wird die eingegebene Schreibweise, damit die Rechnung so lautet, wie der Kunde sie angegeben hat.

- `profileSchema` (Zeile ~20, Konto → Angaben ändern; die Seite sehen auch Admins, deshalb nicht pauschal Pflicht): `vat_id: z.string().trim().max(40).optional(),` ersetzen durch

```ts
  vat_id: z
    .string()
    .trim()
    .max(40)
    .optional()
    .superRefine((wert, ctx) => {
      if (!wert) return;
      const r = pruefeSteuernummer(wert);
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.grund });
    }),
```

  und in der Action nach `if (!parsed.success) …` und vor dem `update` (der angemeldete Nutzer steht dort wie in `vervollstaendigeProfil` als `user` aus `requireUser(...)` zur Verfügung – vor der Änderung die Datei lesen und den Namen der Variablen übernehmen):

```ts
  if (user.role === "customer" && !parsed.data.vat_id) {
    return { error: "Die USt-IdNr. oder Steuernummer fehlt." };
  }
```

  Beim Schreiben bleibt `vat_id: parsed.data.vat_id || null`.

`lib/actions/admin-customers.ts`: Import wie oben. In den beiden Schemata (Zeilen ~91 und ~182) `vat_id: z.string().trim().max(40).optional(),` ersetzen durch

```ts
  // Beim Anlegen durch den Admin darf die Nummer noch fehlen (Telefonkunde);
  // dann ergänzt sie der Kunde beim ersten Login (profilLuecken). Ist sie
  // angegeben, muss sie im Format stimmen.
  vat_id: z
    .string()
    .trim()
    .max(40)
    .optional()
    .superRefine((wert, ctx) => {
      if (!wert) return;
      const r = pruefeSteuernummer(wert);
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.grund });
    }),
```

- [ ] **Step 5: Formulare – Label und Pflicht**

`components/forms/profile-complete-form.tsx` (Zeilen ~79–87):

```tsx
        <Label htmlFor="vat_id">USt-IdNr. / Steuernummer</Label>
        <Input
          id="vat_id"
          name="vat_id"
          required
          defaultValue={user.vat_id ?? ""}
          maxLength={40}
          placeholder="DE123456789 oder 30/123/45678"
        />
```

`components/forms/account-forms.tsx` (Zeile ~81): Label `USt-IdNr.` → `USt-IdNr. / Steuernummer`, dem `<Input id="vat_id" …>` `required` und `placeholder="DE123456789 oder 30/123/45678"` geben.

`components/forms/customer-form.tsx` (Zeile ~112): nur Label → `USt-IdNr. / Steuernummer` (nicht `required`; siehe Step 4).

- [ ] **Step 6: Checkout-Seite**

`app/checkout/page.tsx` macht bereits `profilLuecken(user).length > 0 → redirect("/account/vervollstaendigen?weiter=/checkout")`. Damit führt eine fehlende Nummer ohne weitere Änderung auf die Seite „Angaben vervollständigen". `lib/actions/orders.ts` prüft ebenfalls `profilLuecken(user)` – kein weiterer Code nötig. Den Fehlertext dort anpassen:

```ts
      error:
        "Bitte ergänzen Sie zuerst Ihre Firmen- und Anschriftsdaten sowie Ihre USt-IdNr. oder Steuernummer (Konto → Angaben vervollständigen).",
```

- [ ] **Step 7: Migration 073**

`supabase/migrations/073_steuernummer_pflicht.sql`:

```sql
-- =============================================================================
-- Migration 073 – USt-IdNr. / Steuernummer als Pflichtangabe bei Bestellung
--
-- users.vat_id (Migration 028) nimmt eine USt-IdNr. oder eine Steuernummer
-- auf. Ein Kunde, der für sich selbst bestellt, braucht eine. Das Format prüft
-- die Anwendung (lib/steuernummer.ts) beim Speichern; die Datenbank sichert
-- nur ab, dass überhaupt etwas hinterlegt ist – wie bei der Abholzeit als
-- Trigger auf orders und nur für Kunden, die selbst bestellen. Rechnungen, die
-- der Admin für einen Kunden anlegt, bleiben unberührt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.orders_steuernummer_pruefen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rolle  TEXT;
  v_ust_id TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT role, vat_id INTO v_rolle, v_ust_id
  FROM public.users
  WHERE id = auth.uid();

  IF v_rolle IS DISTINCT FROM 'customer' THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(COALESCE(v_ust_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bitte hinterlegen Sie Ihre USt-IdNr. oder Steuernummer in Ihrem Konto.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_steuernummer ON public.orders;
CREATE TRIGGER trg_orders_steuernummer
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_steuernummer_pruefen();
```

Hinweis: 072 ist die Zahlart-Migration (Task 9). Damit `check:migrations` keine Lücke meldet, die Migrationen in der Reihenfolge 071 → 072 → 073 anlegen: **Task 9 vor dem Commit dieser Migration abarbeiten oder die Datei erst nach Task 9 committen.**

- [ ] **Step 8: Verifikation**

Run: `npm test && npm run lint && npm run build`
Expected: `# fail 0`, Lint und Build ohne Fehler.

Manuell: Kunde ohne Nummer → `/checkout` leitet auf `/account/vervollstaendigen?weiter=/checkout`; Feld mit „abc" → „Bitte eine gültige USt-IdNr. …".

- [ ] **Step 9: Commit (nach Task 9, siehe Hinweis)**

```bash
git add lib/profil.ts tests/profil.test.ts lib/profil-ziel.ts lib/actions/account.ts lib/actions/admin-customers.ts lib/actions/orders.ts components/forms/account-forms.tsx components/forms/profile-complete-form.tsx components/forms/customer-form.tsx supabase/migrations/073_steuernummer_pflicht.sql
git commit -m "feat(steuernummer): USt-IdNr. oder Steuernummer als Pflicht bei Bestellung

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Zahlart – Logik

**Files:**
- Create: `lib/zahlart.ts`, `tests/zahlart.test.ts`
- Modify: `lib/types.ts:26-41`

**Interfaces:**
- Produces:
  - `PaymentMethod = "transfer" | "prepayment" | "cash" | "card"` (`transfer` = Auf Rechnung)
  - `erlaubteZahlarten(lieferart: DeliveryMethod, darfRechnung: boolean): PaymentMethod[]`
  - `vorgabeZahlart(darfRechnung: boolean): PaymentMethod`
  - `istUeberweisung(zahlart: PaymentMethod): boolean` (`transfer` oder `prepayment`)

- [ ] **Step 1: Failing Tests**

`tests/zahlart.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  erlaubteZahlarten,
  istUeberweisung,
  vorgabeZahlart,
} from "@/lib/zahlart";

test("Erstbesteller, Versand: nur Vorkasse", () => {
  assert.deepEqual(erlaubteZahlarten("shipping", false), ["prepayment"]);
});

test("Erstbesteller, Abholung: Vorkasse, bar, Karte – keine Rechnung", () => {
  assert.deepEqual(erlaubteZahlarten("pickup", false), ["prepayment", "cash", "card"]);
});

test("Bestandskunde, Versand: Rechnung und Vorkasse", () => {
  assert.deepEqual(erlaubteZahlarten("shipping", true), ["transfer", "prepayment"]);
});

test("Bestandskunde, Abholung: alle vier", () => {
  assert.deepEqual(erlaubteZahlarten("pickup", true), [
    "transfer",
    "prepayment",
    "cash",
    "card",
  ]);
});

test("Vorgabe: Rechnung für Berechtigte, sonst Vorkasse", () => {
  assert.equal(vorgabeZahlart(true), "transfer");
  assert.equal(vorgabeZahlart(false), "prepayment");
});

test("istUeberweisung", () => {
  assert.equal(istUeberweisung("transfer"), true);
  assert.equal(istUeberweisung("prepayment"), true);
  assert.equal(istUeberweisung("cash"), false);
  assert.equal(istUeberweisung("card"), false);
});
```

Run: `npm test 2>&1 | grep -E "zahlart|Cannot find"` → Expected: `Cannot find module '…/lib/zahlart.ts'`.

- [ ] **Step 2: Typ und Labels in `lib/types.ts`**

Den Block um `PaymentMethod` ersetzen:

```ts
/**
 * Wie der Kunde bezahlt.
 *
 *   prepayment – Vorkasse: überweisen, bevor Ware raus geht. Für Erstbesteller
 *                die einzige Überweisungsart (siehe lib/zahlart.ts).
 *   transfer   – Auf Rechnung: Zahlungsziel nach Rechnung. Erst nach einer
 *                bezahlten Rechnung wählbar (public.darf_auf_rechnung()).
 *   cash/card  – am Tresen, nur zusammen mit Selbstabholung.
 *
 * Der Datenbankwert `transfer` bleibt unverändert, damit bestehende
 * Bestellungen und Rechnungen weiter stimmen
 * (supabase/migrations/029_bestellablauf.sql, 072_zahlart_vorkasse.sql).
 */
export type PaymentMethod = "transfer" | "prepayment" | "cash" | "card";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: "Auf Rechnung",
  prepayment: "Vorkasse (Überweisung)",
  cash: "Bar bei Abholung",
  card: "Karte bei Abholung",
};
```

- [ ] **Step 3: Implementierung**

`lib/zahlart.ts`:

```ts
import type { DeliveryMethod, PaymentMethod } from "@/lib/types";

/**
 * Zahlarten, die für diese Kombination zulässig sind. Reine Anzeigehilfe: die
 * verbindliche Prüfung steht in create_order() und im Trigger der Migration
 * 072. Hier wird nur entschieden, welche Kacheln der Checkout zeigt und
 * anbietet.
 */
export function erlaubteZahlarten(
  lieferart: DeliveryMethod,
  darfRechnung: boolean,
): PaymentMethod[] {
  const zahlarten: PaymentMethod[] = [];
  if (darfRechnung) zahlarten.push("transfer");
  zahlarten.push("prepayment");
  if (lieferart === "pickup") zahlarten.push("cash", "card");
  return zahlarten;
}

/** Vorauswahl im Checkout. */
export function vorgabeZahlart(darfRechnung: boolean): PaymentMethod {
  return darfRechnung ? "transfer" : "prepayment";
}

/** Läuft die Zahlung per Überweisung (Vorkasse oder Rechnung)? */
export function istUeberweisung(zahlart: PaymentMethod): boolean {
  return zahlart === "transfer" || zahlart === "prepayment";
}
```

- [ ] **Step 4: Tests und Typecheck**

Run: `npm test 2>&1 | grep -E "zahlart|^# fail"` → Expected: `# fail 0`.

Run: `npm run build 2>&1 | tail -30`
Expected: Compilerfehler an den Stellen, die `Record<PaymentMethod, …>` voraussetzen (falls vorhanden) – diese werden in Task 10 mit behoben; Build darf an dieser Stelle noch rot sein, solange die Fehler nur `PaymentMethod` betreffen.

- [ ] **Step 5: Commit**

```bash
git add lib/zahlart.ts tests/zahlart.test.ts lib/types.ts
git commit -m "feat(zahlart): Vorkasse als Zahlart, erlaubte Zahlarten als reine Logik

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Zahlart – Migration 072

**Files:**
- Create: `supabase/migrations/072_zahlart_vorkasse.sql`

**Interfaces:**
- Produces: `public.darf_auf_rechnung() RETURNS BOOLEAN`; `create_order()` akzeptiert `prepayment` und weist `transfer` für Erstbesteller ab; Trigger `trg_orders_zahlung_vor_ware` (BEFORE UPDATE OF status).

- [ ] **Step 1: Funktionsrumpf aus 059 extrahieren**

Run (Scratchpad-Verzeichnis verwenden):

```bash
S=/private/tmp/claude-501/-Users-otigo-mac-Desktop-Schreibtisch---MacBook-Pro-von-Orhan-LIDER-Gro-handel/9fd7f7c3-54a7-4cde-ad1e-eb229fb68e5f/scratchpad
mkdir -p "$S"
awk '/^CREATE OR REPLACE FUNCTION public.create_order\(/{f=1} f' supabase/migrations/059_gutschein_warengruppen.sql > "$S/create_order_059.sql"
wc -l "$S/create_order_059.sql"
```
Expected: rund 200 Zeilen, beginnt mit `CREATE OR REPLACE FUNCTION public.create_order(`, endet mit dem `GRANT EXECUTE … TO authenticated;`.

- [ ] **Step 2: Migration zusammensetzen**

Datei `supabase/migrations/072_zahlart_vorkasse.sql` mit diesem Kopf anlegen (danach Inhalt von `$S/create_order_059.sql` anhängen):

```sql
-- =============================================================================
-- Migration 072 – Zahlart Vorkasse, Rechnungskauf erst nach bezahlter Rechnung
--
-- 1. orders.payment_method kennt jetzt 'prepayment' (Vorkasse). 'transfer'
--    bleibt der Datenbankwert für „Auf Rechnung".
-- 2. darf_auf_rechnung(): wahr, wenn der angemeldete Kunde mindestens eine
--    Rechnung mit status 'paid' hat. Ohne Parameter, damit sich nicht fremde
--    Kunden abfragen lassen.
-- 3. create_order() – wie Migration 059; geändert sind nur die drei Prüfungen
--    zur Zahlart. 'transfer' (Auf Rechnung) gibt es nur für Berechtigte;
--    Vorkasse immer; bar/Karte nur bei Abholung.
-- 4. Zahlung vor Ware: eine Vorkasse-Bestellung kann nicht auf 'ready',
--    'shipped' oder 'delivered', solange ihre Rechnung nicht 'paid' ist.
--    Der Admin setzt die Rechnung wie bisher im Bestelldetail auf „bezahlt".
--
-- Bestehende Kunden: wer schon eine als bezahlt markierte Rechnung hat, darf
-- weiter auf Rechnung kaufen; alle anderen starten mit Vorkasse. Wer nach
-- Absprache Rechnung bekommen soll, dessen Rechnung wird im Bestelldetail auf
-- „bezahlt" gesetzt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zahlart-Constraints
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('transfer', 'prepayment', 'cash', 'card'));

-- Bar und Karte gibt es nur am Tresen (wie 029); Überweisungsarten dürfen
-- versendet werden.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_needs_pickup;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_needs_pickup
  CHECK (payment_method IN ('transfer', 'prepayment') OR delivery_method = 'pickup');

-- -----------------------------------------------------------------------------
-- 2. darf_auf_rechnung()
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.darf_auf_rechnung()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.customer_id = auth.uid()
      AND i.status = 'paid'
  );
$$;

REVOKE ALL ON FUNCTION public.darf_auf_rechnung() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.darf_auf_rechnung() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Zahlung vor Ware
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.orders_zahlung_vor_ware()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.payment_method <> 'prepayment' THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('ready', 'shipped', 'delivered')
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.order_id = NEW.id AND i.status = 'paid'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Zahlung ausstehend – Ware erst nach Zahlungseingang freigeben. Bitte die Rechnung zuerst auf „bezahlt“ setzen.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_zahlung_vor_ware ON public.orders;
CREATE TRIGGER trg_orders_zahlung_vor_ware
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_zahlung_vor_ware();

-- -----------------------------------------------------------------------------
-- 4. create_order – wie Migration 059, geändert sind nur die Zahlart-Prüfungen
-- -----------------------------------------------------------------------------

```

Dann `$S/create_order_059.sql` anhängen:

```bash
cat "$S/create_order_059.sql" >> supabase/migrations/072_zahlart_vorkasse.sql
```

- [ ] **Step 3: Die drei Prüfungen in der angehängten Funktion ersetzen**

In `supabase/migrations/072_zahlart_vorkasse.sql` mit dem Edit-Werkzeug ersetzen:

alt:

```sql
  IF p_payment_method NOT IN ('transfer', 'cash', 'card') THEN
    RAISE EXCEPTION 'Ungültige Zahlungsart.';
  END IF;

  IF p_payment_method <> 'transfer' AND p_delivery_method <> 'pickup' THEN
    RAISE EXCEPTION 'Bar- und Kartenzahlung gibt es nur bei Selbstabholung.';
  END IF;
```

neu:

```sql
  IF p_payment_method NOT IN ('transfer', 'prepayment', 'cash', 'card') THEN
    RAISE EXCEPTION 'Ungültige Zahlungsart.';
  END IF;

  IF p_payment_method IN ('cash', 'card') AND p_delivery_method <> 'pickup' THEN
    RAISE EXCEPTION 'Bar- und Kartenzahlung gibt es nur bei Selbstabholung.';
  END IF;

  -- Auf Rechnung erst, wenn der Kunde mindestens eine bezahlte Rechnung hat.
  -- Die Regel steht hier und nicht im Browser: ein Formular lässt sich auch
  -- ohne die Seite abschicken.
  IF p_payment_method = 'transfer' AND NOT public.darf_auf_rechnung() THEN
    RAISE EXCEPTION 'Auf Rechnung ist erst nach einer bezahlten Bestellung möglich. Bitte wählen Sie Vorkasse.';
  END IF;
```

- [ ] **Step 4: Diff gegen 059 prüfen**

Run:

```bash
S=/private/tmp/claude-501/-Users-otigo-mac-Desktop-Schreibtisch---MacBook-Pro-von-Orhan-LIDER-Gro-handel/9fd7f7c3-54a7-4cde-ad1e-eb229fb68e5f/scratchpad
awk '/^CREATE OR REPLACE FUNCTION public.create_order\(/{f=1} f' supabase/migrations/072_zahlart_vorkasse.sql | diff "$S/create_order_059.sql" - | head -40
```
Expected: genau ein Unterschied-Block (die Prüfungen zur Zahlart), sonst nichts.

- [ ] **Step 5: Migrations-Check**

Run: `npm run check:migrations`
Expected: `Migrationen in Ordnung: 73 Dateien, letzte 073_steuernummer_pflicht.sql` (setzt 071 und 073 voraus; vorher: `71` bzw. `72` Dateien, letzte entsprechend).

- [ ] **Step 6: Einspielen und prüfen (Betreiber)**

Reihenfolge im Supabase SQL-Editor: 071, 072, 073. Prüfen:

```sql
SELECT conname FROM pg_constraint WHERE conname IN ('orders_payment_method_check','orders_payment_needs_pickup');
SELECT proname FROM pg_proc WHERE proname IN ('darf_auf_rechnung','orders_zahlung_vor_ware','orders_abholzeit_pruefen','orders_steuernummer_pruefen');
-- Erwartet: 2 bzw. 4 Zeilen
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/072_zahlart_vorkasse.sql
git commit -m "feat(zahlart): Migration 072 – Vorkasse, Rechnungskauf nur nach bezahlter Rechnung, Zahlungssperre

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Danach die zurückgestellten Dateien aus Task 7 committen (dort Step 9).

---

## Task 10: Zahlart – Checkout, Bestellseiten, Mails, Admin

**Files:**
- Create: `lib/queries/zahlart.ts`
- Modify: `lib/actions/orders.ts:34,58-64,90`, `lib/actions/admin-orders.ts:96-102`, `app/checkout/page.tsx`, `components/forms/checkout-form.tsx`, `app/orders/[id]/page.tsx:80,106-109,320-330`, `lib/emails/order-confirmation.ts:57`, `lib/emails/invoice.ts:13`, `lib/emails/order-ready.ts:43`, `lib/invoice.ts:343-347`, `lib/faq.tsx:179`, `app/admin/orders/[id]/page.tsx:100-103`

**Interfaces:**
- Consumes: `erlaubteZahlarten`, `vorgabeZahlart`, `istUeberweisung` (Task 8); RPC `darf_auf_rechnung` (Task 9).
- Produces: `getDarfAufRechnung(): Promise<boolean>`; Prop `darfRechnung: boolean` an `CheckoutForm`.

- [ ] **Step 1: Abfrage**

`lib/queries/zahlart.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Darf der angemeldete Kunde auf Rechnung kaufen? (Migration 072: mindestens
 * eine als bezahlt markierte Rechnung.) Bei einem Fehler – etwa weil die
 * Migration noch fehlt – gilt „nein": Vorkasse ist die sichere Seite.
 */
export async function getDarfAufRechnung(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("darf_auf_rechnung");
  if (error) {
    console.error("[bestellung] darf_auf_rechnung:", error.message);
    return false;
  }
  return data === true;
}
```

- [ ] **Step 2: `createOrder` – Schema und Rückfall**

In `lib/actions/orders.ts`:

```ts
    paymentMethod: z.enum(["transfer", "prepayment", "cash", "card"]).default("prepayment"),
```

Die `.refine` für Bar/Karte ersetzen:

```ts
  .refine(
    (data) =>
      data.paymentMethod === "transfer" ||
      data.paymentMethod === "prepayment" ||
      data.deliveryMethod === "pickup",
    {
      message: "Bar- und Kartenzahlung gibt es nur bei Selbstabholung.",
      path: ["paymentMethod"],
    },
  );
```

Rückfall beim Lesen: `paymentMethod: formData.get("paymentMethod") ?? "transfer",` → `?? "prepayment",`.

- [ ] **Step 3: `updateOrderStatus` – Meldung der Sperre durchreichen**

In `lib/actions/admin-orders.ts` den Fehlerzweig ersetzen:

```ts
  if (error) {
    console.error("[admin] Status ändern:", error.code, error.message);
    // Die Sperre „Zahlung vor Ware" (Migration 072) ist eine eigene,
    // verständliche Meldung (P0001) und gehört auf den Bildschirm.
    return {
      error:
        error.code === "P0001"
          ? error.message
          : "Der Status konnte nicht geändert werden.",
    };
  }
```

- [ ] **Step 4: Checkout-Seite**

`app/checkout/page.tsx`: Import `import { getDarfAufRechnung } from "@/lib/queries/zahlart";` und das `Promise.all` auf vier Einträge erweitern:

```tsx
  const [company, kondition, zeiten, darfRechnung] = await Promise.all([
    getCompanySettings(),
    getMeineKondition(),
    getOeffnungszeiten(),
    getDarfAufRechnung(),
  ]);
```

Prop: `darfRechnung={darfRechnung}`.

- [ ] **Step 5: Checkout-Formular**

`components/forms/checkout-form.tsx`:

Imports ergänzen: `import { erlaubteZahlarten, vorgabeZahlart } from "@/lib/zahlart";`. Aus `lucide-react` die Icons `Landmark`, `Banknote`, `CreditCard` bleiben, zusätzlich `FileText`, `Clock` falls nötig.

`Auswahlkachel` um `disabled` erweitern:

```tsx
function Auswahlkachel({
  aktiv,
  onSelect,
  icon,
  title,
  text,
  disabled = false,
}: {
  aktiv: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={aktiv}
      className={cn(
        "flex gap-3 rounded-md border p-4 text-left transition-colors",
        aktiv
          ? "border-foreground bg-secondary"
          : "border-border hover:border-foreground/30",
        disabled && "cursor-not-allowed opacity-50 hover:border-border",
      )}
    >
```

(Rest der Kachel unverändert.)

Prop `darfRechnung: boolean` in Signatur und Typ aufnehmen. Zustand und abgeleiteten Wert ersetzen:

```tsx
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    vorgabeZahlart(darfRechnung),
  );
```

```tsx
  const erlaubt = erlaubteZahlarten(deliveryMethod, darfRechnung);
  const zahlart: PaymentMethod = erlaubt.includes(paymentMethod)
    ? paymentMethod
    : vorgabeZahlart(darfRechnung);
```

(Die bisherige Zeile `const zahlart: PaymentMethod = deliveryMethod === "shipping" ? "transfer" : paymentMethod;` entfällt.)

Den Zahlungsblock (`<section><h2 className="font-medium">Zahlung</h2> … </section>`) ersetzen:

```tsx
        <section>
          <h2 className="font-medium">Zahlung</h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Auswahlkachel
              aktiv={zahlart === "prepayment"}
              onSelect={() => setPaymentMethod("prepayment")}
              icon={<Landmark className="size-5" aria-hidden />}
              title="Vorkasse – sofort überweisen"
              text="Sie überweisen vorab, wir liefern bzw. halten die Ware nach Zahlungseingang bereit."
            />
            <Auswahlkachel
              aktiv={zahlart === "transfer"}
              onSelect={() => setPaymentMethod("transfer")}
              disabled={!darfRechnung}
              icon={<Landmark className="size-5" aria-hidden />}
              title="Auf Rechnung"
              text={
                darfRechnung
                  ? "Rechnung kommt per E-Mail, Zahlung innerhalb des Zahlungsziels."
                  : "Erst nach Ihrer ersten bezahlten Bestellung verfügbar."
              }
            />
            {versand ? null : (
              <>
                <Auswahlkachel
                  aktiv={zahlart === "cash"}
                  onSelect={() => setPaymentMethod("cash")}
                  icon={<Banknote className="size-5" aria-hidden />}
                  title="Bar bei Abholung"
                  text="Zahlung am Tresen, wenn Sie die Ware mitnehmen."
                />
                <Auswahlkachel
                  aktiv={zahlart === "card"}
                  onSelect={() => setPaymentMethod("card")}
                  icon={<CreditCard className="size-5" aria-hidden />}
                  title="Karte bei Abholung"
                  text="EC- oder Kreditkarte am Tresen."
                />
              </>
            )}
          </div>

          {versand ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Bar- und Kartenzahlung gibt es nur bei Selbstabholung.
            </p>
          ) : null}
          {!darfRechnung ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Bei der ersten Bestellung zahlen Sie vorab per Überweisung oder bar
              bei Abholung. Danach steht Ihnen der Kauf auf Rechnung offen.
            </p>
          ) : null}
        </section>
```

Der Kommentarblock über `abweichendEffektiv`, der „bar oder Karte gibt es nur am Tresen" erklärt, bleibt gültig; die darin genannte Ableitung beschreibt jetzt `zahlart` über `erlaubt`.

- [ ] **Step 6: Kunden-Bestellseite**

`app/orders/[id]/page.tsx`:

Import `import { istUeberweisung } from "@/lib/zahlart";`.

Zeile 80 ersetzen:

```tsx
  const ueberweisung = istUeberweisung(order.payment_method);
  const vorkasse = order.payment_method === "prepayment";
```

Banner (Zeilen ~106–109):

```tsx
              {ueberweisung
                ? vorkasse
                  ? " Bitte überweisen Sie jetzt. Nach Zahlungseingang gehen wir in die Bearbeitung."
                  : " Die Rechnung ist unterwegs; bitte überweisen Sie innerhalb des Zahlungsziels."
                : " Abholbar in der Regel am selben oder am nächsten Werktag. Rufen Sie dafür gerne kurz durch."}
```

Absatz im Zahlungsblock (Zeilen ~325–331: „Bitte überweisen Sie den Gesamtbetrag. Die Bearbeitung startet mit dem Zahlungseingang.") ersetzen:

```tsx
                  <p className="mt-3 text-sm text-muted-foreground">
                    {vorkasse
                      ? "Bitte überweisen Sie den Gesamtbetrag jetzt. Wir bearbeiten und versenden Ihre Bestellung nach Zahlungseingang."
                      : "Bitte überweisen Sie den Gesamtbetrag bis zum unten genannten Datum."}
                  </p>
```

- [ ] **Step 7: Mails**

`lib/emails/order-confirmation.ts:57`:

```ts
import { istUeberweisung } from "@/lib/zahlart";
```
```ts
  const zahlung =
    istUeberweisung(order.payment_method)
      ? `<p style="font-size:14px;color:#374151;margin-top:20px;">
           Bitte überweisen Sie <strong>${formatPrice(betraege.brutto)}</strong>.
           ${
             order.payment_method === "prepayment"
               ? "Wir beginnen mit der Bearbeitung, sobald die Zahlung bei uns eingegangen ist."
               : "Die Zahlung ist innerhalb des auf der Rechnung genannten Zahlungsziels fällig."
           }
           Die Rechnung mit allen Angaben folgt in einer eigenen E-Mail.
         </p>
```

(der `bankzeilen`-Block und der `: <p>…Sie zahlen…</p>`-Zweig bleiben unverändert.)

`lib/emails/invoice.ts:13`: `const ueberweisung = istUeberweisung(order.payment_method);` mit Import `import { istUeberweisung } from "@/lib/zahlart";`.

`lib/emails/order-ready.ts:43`: Bedingung `order.payment_method === "transfer"` → `istUeberweisung(order.payment_method)`, Import wie oben; Text „ist per Überweisung zu begleichen" bleibt.

- [ ] **Step 8: Rechnungs-PDF**

`lib/invoice.ts:343-347` ersetzen:

```ts
  const zahlvermerk =
    order.payment_method === "cash"
      ? "Zahlung bar bei Abholung."
      : order.payment_method === "card"
        ? "Zahlung per Karte bei Abholung."
        : order.payment_method === "prepayment"
          ? "Zahlbar vor Lieferung per Überweisung (Vorkasse). Die Ware wird nach Zahlungseingang versendet bzw. bereitgestellt."
          : null;
```

(Der Kommentar darüber: „Bar und Karte werden bei der Abholung kassiert. …" um „Vorkasse ist zahlbar vor Lieferung; ein Fälligkeitsdatum hätte hier keinen Sinn." ergänzen.)

- [ ] **Step 9: FAQ**

`lib/faq.tsx:179`:

```ts
            "Bei der ersten Bestellung zahlen Sie per Vorkasse (Überweisung vorab) oder bar bei Selbstabholung. Nach der ersten bezahlten Bestellung können Sie auch auf Rechnung kaufen. Kartenzahlung gibt es nur bei Selbstabholung – bezahlt wird dann bei der Übergabe.",
```

- [ ] **Step 10: Admin-Bestelldetail**

`app/admin/orders/[id]/page.tsx` (Zeilen ~100–103) ersetzen:

```tsx
        <div>
          <dt className="text-muted-foreground">Zahlung</dt>
          <dd className="mt-1">
            {PAYMENT_METHOD_LABELS[order.payment_method]}
            {order.payment_method === "prepayment" && invoice?.status !== "paid" ? (
              <span className="ml-2 rounded-full bg-signal px-2 py-0.5 text-xs font-semibold text-signal-foreground">
                Zahlung ausstehend
              </span>
            ) : null}
          </dd>
        </div>
```

Außerdem unter die `<OrderStatusSelect …/>`-Zeile (nach `</div>` des Kopfes) einfügen:

```tsx
      {order.payment_method === "prepayment" && invoice?.status !== "paid" ? (
        <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Vorkasse: „Abholbereit“, „Versendet“ und „Geliefert“ sind erst möglich,
          wenn die Rechnung unten auf „bezahlt“ steht.
        </p>
      ) : null}
```

- [ ] **Step 11: Verifikation**

Run: `npm test && npm run lint && npm run build && npm run check:migrations`
Expected: alle vier ohne Fehler.

Manuell, mit angewandten Migrationen 071–073:

1. Neukunde (keine bezahlte Rechnung): Checkout zeigt „Vorkasse" gewählt, „Auf Rechnung" ausgegraut. Bestellen per Versand → Bestellseite zeigt IBAN, Rechnungsnummer als Verwendungszweck, Text „… nach Zahlungseingang".
2. Admin öffnet die Bestellung: Badge „Zahlung ausstehend"; Status auf „Abholbereit" → Meldung „Zahlung ausstehend – Ware erst nach Zahlungseingang freigeben. …".
3. Admin setzt die Rechnung auf „bezahlt", dann Status „Abholbereit" → gelingt.
4. Derselbe Kunde bestellt erneut: „Auf Rechnung" ist jetzt wählbar und vorausgewählt.
5. Abholung, bar, Neukunde: bestellbar, keine Sperre (Zahlart `cash` unterliegt dem Trigger nicht).
6. Versand mit direkt abgesetztem `payment_method=transfer` für Neukunden → Meldung „Auf Rechnung ist erst nach einer bezahlten Bestellung möglich. …".

- [ ] **Step 12: Commit**

```bash
git add lib/queries/zahlart.ts lib/actions/orders.ts lib/actions/admin-orders.ts app/checkout/page.tsx components/forms/checkout-form.tsx "app/orders/[id]/page.tsx" lib/emails/order-confirmation.ts lib/emails/invoice.ts lib/emails/order-ready.ts lib/invoice.ts lib/faq.tsx "app/admin/orders/[id]/page.tsx"
git commit -m "feat(zahlart): Vorkasse/Rechnung im Checkout, Zahlung vor Ware, Texte und Admin-Hinweis

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 11: Dokumentation

**Files:**
- Modify: `docs/shop.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-15-bestellablauf-erweiterung-design.md`

- [ ] **Step 1: `docs/shop.md` ergänzen**

Am Ende des Abschnitts zum Bestellablauf drei Unterabschnitte anhängen (Überschriftenstil wie die vorhandenen):

```markdown
## 🕑 Öffnungszeiten

`company_settings.opening_hours` (Migration 071): sieben Einträge, Index 0 =
Montag, `{open, close}` oder `null`. Gepflegt unter
`/admin/settings/oeffnungszeiten`. Eine Rechenstelle: `lib/oeffnungszeiten.ts`
(Browser, Seiten) und der Trigger `orders_abholzeit_pruefen()` (Datenbank) –
Europe/Berlin, Öffnung und Schluss inklusive. Besucher ohne Konto lesen sie
über `public_opening_hours()`. Der Trigger greift nur, wenn der Kunde selbst
bestellt; Admin-Rechnungen und Kassenverkäufe bleiben unberührt.

## 💳 Zahlart und Erstbestellung

- Zahlarten: `prepayment` (Vorkasse), `transfer` (**Auf Rechnung** – der Wert
  blieb, damit Altbestellungen stimmen), `cash`, `card` (nur Abholung).
- **Auf Rechnung** nur, wenn `darf_auf_rechnung()` wahr ist: der Kunde hat
  mindestens eine Rechnung mit `status = 'paid'`. Entschieden in
  `create_order()` (Migration 072); der Checkout zeigt die Kachel nur
  ausgegraut (`lib/zahlart.ts`).
- **Zahlung vor Ware:** Trigger `orders_zahlung_vor_ware()` – eine
  Vorkasse-Bestellung kann erst auf `ready`/`shipped`/`delivered`, wenn ihre
  Rechnung `paid` ist. „Bezahlt" setzt der Admin wie bisher am
  Bestelldetail (`InvoiceStatusSelect`).
- Ein Bestandskunde ohne als bezahlt markierte Rechnung beginnt mit Vorkasse.

## 🧾 Steuernummer

`users.vat_id` nimmt USt-IdNr. **oder** Steuernummer auf und ist Pflicht für
Kunden, die selbst bestellen (`profilLuecken()`, Trigger
`orders_steuernummer_pruefen()`, Migration 073). Das Format prüft
`lib/steuernummer.ts` beim Speichern; es gibt keine Online-Abfrage (VIES/BZSt).

## 🔎 Suche

`components/site-search.tsx` – GET-Formular auf `/shop?q=` in Kopfleiste,
Klappmenü und Startseite. Gesucht wird wortweise (`lib/search.ts`), auch für
Besucher (ohne Preise).
```

- [ ] **Step 2: `CLAUDE.md`**

Unter „Admin Pages" in der `/admin/settings`-Aufzählung `/oeffnungszeiten` ergänzen („… `/hinweisleiste`, `/oeffnungszeiten`, `/texte` …"). Unter „Harte Regeln" anhängen:

```markdown
- **Auf Rechnung kaufen** darf nur, wer mindestens eine als bezahlt markierte
  Rechnung hat (`darf_auf_rechnung()`, Migration 072). Erstbesteller zahlen
  per Vorkasse oder bar bei Abholung; Vorkasse-Ware geht erst nach „bezahlt".
- **Steuernummer** ist Pflicht für Bestellungen (`profilLuecken()`, Migration
  073).
```

- [ ] **Step 3: Spec nachziehen**

In `docs/superpowers/specs/2026-10-15-bestellablauf-erweiterung-design.md` Abschnitt 3 „Datenmodell" und „Admin" auf den Stand des Plans bringen: `orders.paid_at` und der neue Knopf entfallen („bezahlt" = `invoices.status = 'paid'`, vorhandener `InvoiceStatusSelect`); `darf_auf_rechnung()` ohne Parameter; Trigger statt `create_order()`-Änderung für Abholzeit und Steuernummer; Suche nutzt das vorhandene `/shop?q=`; Öffnungszeiten für Besucher über `public_opening_hours()`. Den Abschnitt „Abweichungen" dieses Plans als Quelle verwenden.

- [ ] **Step 4: Abschluss-Verifikation**

Run: `npm test && npm run lint && npm run build && npm run check:migrations`
Expected: alle vier ohne Fehler.

- [ ] **Step 5: Commit**

```bash
git add docs/shop.md CLAUDE.md docs/superpowers/specs/2026-10-15-bestellablauf-erweiterung-design.md
git commit -m "docs: Öffnungszeiten, Zahlart, Steuernummer, Suche

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec-Abdeckung**

| Spec | Task |
|------|------|
| 1 Steuernummer: `profil.ts`, `steuernummer.ts`, Formulare, Checkout-Sperre, DB-Prüfung | 6, 7 |
| 2 Öffnungszeiten: Spalte, Logik, Pflege, Anzeige, Abholtermin (Client + Server) | 2, 3, 4, 5 |
| 3 Zahlart: Typ, `darf_auf_rechnung`, Constraints, `create_order`, Sperre, Checkout, Bestellseite, Mails, PDF | 8, 9, 10 |
| 4 Suche: Header, Startseite, Handy | 1 |
| Tests: `steuernummer`, `oeffnungszeiten`, `zahlart` | 2, 6, 8 |
| Doku: `docs/shop.md`, `CLAUDE.md` | 11 |

**Bekannte Risiken, die der Betreiber vor dem Einspielen kennen muss**

- Bestandskunden ohne USt-IdNr./Steuernummer werden beim nächsten Checkout auf „Angaben vervollständigen" geleitet.
- Bestandskunden ohne als bezahlt markierte Rechnung können nicht mehr auf Rechnung bestellen, bis die erste Rechnung „bezahlt" ist. Wer von Anfang an Rechnung bekommen soll: eine Rechnung des Kunden im Bestelldetail auf „bezahlt" setzen.
- `check:migrations` meldet bei 071 + 073 ohne 072 eine Lücke – Task 9 vor dem Commit von 073 abschließen.

**Typkonsistenz:** `Oeffnungszeiten`, `istGeoeffnet`, `formatOeffnungszeiten`, `parseOeffnungszeiten`, `openingHoursSpecification` (Task 2) werden in 4 und 5 mit denselben Namen verwendet. `PaymentMethod`, `erlaubteZahlarten`, `vorgabeZahlart`, `istUeberweisung` (Task 8) in 10 identisch. RPC-Namen `public_opening_hours`, `darf_auf_rechnung` (3, 9) stimmen mit den Aufrufen in 4 und 10 überein. Trigger-Funktionsnamen (`orders_abholzeit_pruefen`, `orders_steuernummer_pruefen`, `orders_zahlung_vor_ware`) in Migrationen und Doku gleich.
