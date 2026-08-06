# Header-Logo, Zugangsanfrage-Formular, Konto-Adressen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echtes Logo im Header (immer verlinkt auf `/`), ein echtes
Zugangsanfrage-Formular auf der Landingpage inkl. Admin-Übersicht, und
Rechnungs-/Versandadresse im Kundenkonto (die Versandadresse befüllt den
Checkout vor).

**Architecture:** Next.js App Router, Server Actions für alle Schreib­zugriffe
(`"use server"`, `useActionState` im Client), Supabase/Postgres mit RLS für
Datenhaltung. Neue Tabelle `access_requests` folgt exakt dem bestehenden
Migrations-Muster (`supabase/migrations/00N_*.sql`, idempotent, `IF NOT
EXISTS`). Neue Admin-Seite folgt dem Liste+Detail-Muster von
`/admin/orders`. Neue Kontofelder folgen dem Muster von `ProfileForm` /
`updateProfile`.

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions), React 19,
TypeScript, Tailwind v4, Supabase (Postgres + RLS), Zod, shadcn/ui-Komponenten
(`components/ui/*`), `next/image`.

## Global Constraints

- Kein neues Test-Framework: Das Projekt hat keine Unit-Tests. Verifikation
  läuft über `npm run build` (Next generiert Typen wie `PageProps` erst beim
  Build – **nicht** `tsc --noEmit` verwenden) und `npm run lint`.
- Alle Oberflächentexte auf Deutsch, im bestehenden nüchternen B2B-Ton (siehe
  CLAUDE.md: keine KI-Ästhetik, keine Marketing-Floskeln).
- SQL-Migrationen sind idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY
  IF EXISTS` vor `CREATE POLICY`) und werden **nicht** automatisch
  ausgeführt – der Nutzer führt sie manuell im Supabase SQL Editor aus.
- `supabase/schema.sql` bleibt der historische Basisstand und wird **nicht**
  nachträglich um die neuen Spalten/Tabellen ergänzt (bestehendes Muster:
  `delivery_method` aus Migration 004 steht auch nicht in `schema.sql`) –
  nur die Kopfkommentar-Liste der auszuführenden Dateien wird um Eintrag 6
  ergänzt.
- Adressfelder sind Freitext (ein `TEXT`-Feld, mehrzeilig), keine
  strukturierten Straße/PLZ/Ort-Einzelfelder – konsistent mit dem
  bestehenden `orders.delivery_address`.
- Formulare nutzen `useActionState` + eine `SaveButton`-Komponente mit
  `useFormStatus()`, keine externen Formular-Bibliotheken.

---

### Task 1: Datenbank-Migration – Adressfelder + Zugangsanfragen-Tabelle

**Files:**
- Create: `supabase/migrations/005_zugangsanfragen_und_adressen.sql`
- Modify: `supabase/schema.sql:1-12` (Kopfkommentar, Liste der Dateien)

**Interfaces:**
- Produces: Spalten `public.users.billing_address TEXT`,
  `public.users.shipping_address TEXT`. Tabelle `public.access_requests`
  mit Spalten `id, company_name, contact_name, email, phone,
  billing_address, shipping_address, message, status, created_at`, `status`
  eingeschränkt auf `'new' | 'contacted' | 'done'`. RLS: Insert für
  `anon, authenticated` offen, Select/Update/Delete nur für Admins
  (`public.is_admin()`).

- [ ] **Step 1: Migration schreiben**

```sql
-- =============================================================================
-- Migration 005 – Konto-Adressen und Zugangsanfragen
--
-- 1. Kunden bekommen Rechnungs- und Versandadresse im eigenen Konto.
-- 2. Neue Tabelle für Zugangsanfragen von der Landingpage: jeder darf eine
--    Anfrage einreichen (kein Login nötig), lesen/bearbeiten dürfen nur
--    Admins.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Adressfelder am Kundenkonto
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_address  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- -----------------------------------------------------------------------------
-- 2. Zugangsanfragen
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.access_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     TEXT NOT NULL,
  contact_name     TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  billing_address  TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'contacted', 'done')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON public.access_requests(status, created_at DESC);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_requests_insert_public ON public.access_requests;
DROP POLICY IF EXISTS access_requests_admin_all      ON public.access_requests;

-- Landingpage-Formular: auch anonyme Besucher dürfen eine Zeile anlegen,
-- aber nichts zurücklesen (kein SELECT-Grant für anon/authenticated hier).
CREATE POLICY access_requests_insert_public ON public.access_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY access_requests_admin_all ON public.access_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

- [ ] **Step 2: Kopfkommentar in `supabase/schema.sql` ergänzen**

In `supabase/schema.sql` Zeile 4-9 (die nummerierte Liste) den fünften
Eintrag ergänzen:

```sql
--   1. supabase/schema.sql                              (diese Datei)
--   2. supabase/migrations/001_bestand_auf_produkt.sql
--   3. supabase/migrations/002_bestellung_anlegen.sql
--   4. supabase/migrations/003_erstadmin_ermoeglichen.sql
--   5. supabase/migrations/004_artikelnummern_und_versand.sql
--   6. supabase/migrations/005_zugangsanfragen_und_adressen.sql
```

- [ ] **Step 3: Manuell im Supabase SQL Editor ausführen**

Datei `supabase/migrations/005_zugangsanfragen_und_adressen.sql` einmal im
Supabase-Projekt (SQL Editor) ausführen. Danach prüfen:

```sql
select column_name from information_schema.columns
where table_name = 'users' and column_name in ('billing_address', 'shipping_address');
-- erwartet: 2 Zeilen

select * from public.access_requests limit 1;
-- erwartet: leere Ergebnisliste, kein Fehler
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_zugangsanfragen_und_adressen.sql supabase/schema.sql
git commit -m "feat(db): Adressfelder am Konto und Tabelle access_requests"
```

---

### Task 2: Domain-Typen erweitern

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nichts (reine Typdefinitionen).
- Produces: `AppUser.billing_address: string | null`,
  `AppUser.shipping_address: string | null`. Neuer Typ
  `AccessRequestStatus = "new" | "contacted" | "done"`, Konstante
  `ACCESS_REQUEST_STATUS_LABELS: Record<AccessRequestStatus, string>`,
  Interface `AccessRequest`.

- [ ] **Step 1: `AppUser` um Adressfelder ergänzen**

In `lib/types.ts` den bestehenden Block:

```ts
export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}
```

ersetzen durch:

```ts
export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  billing_address: string | null;
  shipping_address: string | null;
}
```

- [ ] **Step 2: `AccessRequest`-Typen anfügen**

Am Ende von `lib/types.ts` (nach `CartItem`) anfügen:

```ts
export type AccessRequestStatus = "new" | "contacted" | "done";

export const ACCESS_REQUEST_STATUS_LABELS: Record<AccessRequestStatus, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  done: "Erledigt",
};

export interface AccessRequest {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  billing_address: string;
  shipping_address: string;
  message: string | null;
  status: AccessRequestStatus;
  created_at: string;
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: Build bricht an dieser Stelle noch nicht ab durch diese Datei
allein (andere Dateien, die `AppUser` ohne die neuen Felder konstruieren,
z. B. per `select("id, email, ...")`, geben zur Laufzeit `undefined` für die
neuen Felder zurück – das ist typsicher, weil `string | null` auch
`undefined`-artige DB-Antworten abdeckt; TypeScript prüft hier keine
Laufzeitwerte). Falls der Build wegen eines anderen, unfertigen Tasks in
dieser Datei rot ist, das an dieser Stelle ignorieren und mit Task 3
weitermachen – der Build wird erst nach Task 3 wieder grün erwartet.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): Adressfelder und AccessRequest-Typ ergänzen"
```

---

### Task 3: `getCurrentUser` liefert Adressfelder mit

**Files:**
- Modify: `lib/auth.ts:31-35`

**Interfaces:**
- Consumes: `AppUser` aus Task 2 (jetzt mit `billing_address`,
  `shipping_address`).
- Produces: `getCurrentUser()` liefert ein vollständiges `AppUser`-Objekt
  inkl. der beiden neuen Felder – wird von `app/account/page.tsx` (Task 6)
  und `app/checkout/page.tsx` (Task 7) konsumiert.

- [ ] **Step 1: Select-Liste erweitern**

In `lib/auth.ts` die bestehende Zeile:

```ts
    .select("id, email, full_name, company_name, role, is_active, created_at")
```

ersetzen durch:

```ts
    .select(
      "id, email, full_name, company_name, role, is_active, created_at, billing_address, shipping_address",
    )
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: Erfolgreicher Build (`Compiled successfully`), keine
TypeScript-Fehler zu `AppUser`.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): Adressfelder in getCurrentUser laden"
```

---

### Task 4: Server Action `updateAddresses`

**Files:**
- Modify: `lib/actions/account.ts`

**Interfaces:**
- Consumes: `requireUser` aus `lib/auth.ts`, `createClient` aus
  `lib/supabase/server.ts`, `FormState` (bereits in dieser Datei definiert).
- Produces: `updateAddresses(prevState: FormState, formData: FormData):
  Promise<FormState>` – erwartet Felder `billing_address`,
  `shipping_address` (beide optional, Freitext). Wird von `AddressForm`
  (Task 5) konsumiert.

- [ ] **Step 1: Schema und Action anfügen**

Am Ende von `lib/actions/account.ts` (nach `updateProfile`, vor der
`passwordSchema`-Definition ist auch ok – hier: direkt nach `updateProfile`
einfügen):

```ts
const addressSchema = z.object({
  billing_address: z.string().trim().max(500).optional(),
  shipping_address: z.string().trim().max(500).optional(),
});

export async function updateAddresses(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/account");

  const parsed = addressSchema.safeParse({
    billing_address: formData.get("billing_address") ?? undefined,
    shipping_address: formData.get("shipping_address") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({
      billing_address: parsed.data.billing_address || null,
      shipping_address: parsed.data.shipping_address || null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[konto] Adressen:", error.message);
    return { error: "Die Adressen konnten nicht gespeichert werden." };
  }

  revalidatePath("/account");
  return { success: "Adressen gespeichert." };
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/account.ts
git commit -m "feat(account): Server Action zum Speichern der Adressen"
```

---

### Task 5: `AddressForm`-Komponente

**Files:**
- Modify: `components/forms/account-forms.tsx`

**Interfaces:**
- Consumes: `updateAddresses` aus Task 4, `AppUser` (Task 2), bestehende
  `SaveButton`/`Feedback`-Helfer aus derselben Datei.
- Produces: `AddressForm({ user }: { user: AppUser })` – wird von
  `app/account/page.tsx` (Task 6) konsumiert.

- [ ] **Step 1: Import ergänzen**

In `components/forms/account-forms.tsx` die Import-Zeile:

```ts
import {
  changePassword,
  updateProfile,
  type FormState,
} from "@/lib/actions/account";
```

ersetzen durch:

```ts
import {
  changePassword,
  updateAddresses,
  updateProfile,
  type FormState,
} from "@/lib/actions/account";
```

und `Textarea` importieren (Datei hat aktuell keinen Textarea-Import):

```ts
import { Textarea } from "@/components/ui/textarea";
```

- [ ] **Step 2: Komponente anfügen**

Nach `ProfileForm` (vor `PasswordForm`) einfügen:

```tsx
export function AddressForm({ user }: { user: AppUser }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateAddresses,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="billing_address">Rechnungsadresse</Label>
        <Textarea
          id="billing_address"
          name="billing_address"
          rows={4}
          maxLength={500}
          defaultValue={user.billing_address ?? ""}
          placeholder="Firma, Straße, PLZ Ort"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipping_address">Versandadresse</Label>
        <Textarea
          id="shipping_address"
          name="shipping_address"
          rows={4}
          maxLength={500}
          defaultValue={user.shipping_address ?? ""}
          placeholder="Firma, Straße, PLZ Ort"
        />
        <p className="text-xs text-muted-foreground">
          Wird im Bestellprozess als Vorschlag für die Lieferadresse
          verwendet.
        </p>
      </div>

      <Feedback state={state} />
      <SaveButton label="Adressen speichern" />
    </form>
  );
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add components/forms/account-forms.tsx
git commit -m "feat(account): AddressForm-Komponente"
```

---

### Task 6: Adress-Sektion auf `/account`

**Files:**
- Modify: `app/account/page.tsx`

**Interfaces:**
- Consumes: `AddressForm` aus Task 5.
- Produces: sichtbare „Adressen"-Sektion zwischen „Stammdaten" und
  „Passwort".

- [ ] **Step 1: Import und Sektion ergänzen**

Import-Zeile:

```ts
import { PasswordForm, ProfileForm } from "@/components/forms/account-forms";
```

ersetzen durch:

```ts
import {
  AddressForm,
  PasswordForm,
  ProfileForm,
} from "@/components/forms/account-forms";
```

Neue Sektion zwischen dem `Stammdaten`- und dem `Passwort`-`<section>`
einfügen:

```tsx
      <section className="mt-6 rounded-md border border-border p-6">
        <h2 className="font-medium">Adressen</h2>
        <div className="mt-4">
          <AddressForm user={user} />
        </div>
      </section>
```

(Die bestehende `Stammdaten`-Sektion hatte `mt-10`, die neue folgt direkt
danach mit `mt-6`, wie es die bestehende `Passwort`-Sektion bereits als
Abstand zwischen zwei Karten nutzt.)

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Manuell im Browser prüfen**

`npm run dev`, als Kunde einloggen, `/account` öffnen: Sektion „Adressen"
mit zwei Textfeldern ist sichtbar, Speichern zeigt „Adressen gespeichert."

- [ ] **Step 4: Commit**

```bash
git add app/account/page.tsx
git commit -m "feat(account): Adress-Sektion auf der Kontoseite"
```

---

### Task 7: Versandadresse im Checkout vorbefüllen

**Files:**
- Modify: `app/checkout/page.tsx`

**Interfaces:**
- Consumes: `user.shipping_address` aus `requireUser()` (Task 3).
- Produces: `<CheckoutForm defaultAddress={...} />` – Prop existiert
  bereits in `components/forms/checkout-form.tsx`, wird bisher nirgends
  gesetzt.

- [ ] **Step 1: Prop setzen**

In `app/checkout/page.tsx` die Zeile:

```tsx
        <CheckoutForm />
```

ersetzen durch:

```tsx
        <CheckoutForm defaultAddress={user.shipping_address ?? undefined} />
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Manuell im Browser prüfen**

Als Kunde mit gespeicherter Versandadresse (Task 6) etwas in den Warenkorb
legen, `/checkout` öffnen: Feld „Lieferadresse" ist mit der gespeicherten
Versandadresse vorausgefüllt.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/page.tsx
git commit -m "feat(checkout): Versandadresse aus dem Konto vorschlagen"
```

---

### Task 8: Logo im Header

**Files:**
- Modify: `components/header.tsx`

**Interfaces:**
- Consumes: Bilddatei unter `public/logo/logo.svg` (Ordner existiert
  bereits, Datei wird vom Nutzer selbst dort abgelegt).
- Produces: Logo-Link, der immer zu `/` führt.

- [ ] **Step 1: Import ergänzen**

In `components/header.tsx` ergänzen:

```ts
import Image from "next/image";
```

- [ ] **Step 2: Wortmarke durch Bild-Logo ersetzen**

Den Block:

```tsx
        <Link
          href={user ? "/shop" : "/"}
          className="shrink-0 leading-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <span className="block text-base font-semibold tracking-[0.14em]">
            LIDER
          </span>
          <span className="eyebrow block text-surface-dark-muted">
            Berlin · Großhandel
          </span>
        </Link>
```

ersetzen durch:

```tsx
        <Link
          href="/"
          className="relative block h-8 w-36 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <Image
            src="/logo/logo.svg"
            alt="LIDER Großhandel"
            fill
            sizes="144px"
            className="object-contain object-left"
          />
        </Link>
```

`user` wird dadurch in dieser Funktion möglicherweise nicht mehr für den
Link gebraucht, bleibt aber weiter für `isAdmin`, `links` und den
`UserMenu`/Anmelden-Zweig in Gebrauch – kein toter Code.

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`. `next/image` meldet keinen Fehler auch
wenn `public/logo/logo.svg` zum Build-Zeitpunkt noch fehlt (lokale
`/public`-Pfade werden nicht beim Build validiert, nur zur Laufzeit
geladen).

- [ ] **Step 4: Manuell im Browser prüfen**

`npm run dev`, `/` öffnen. Falls `public/logo/logo.svg` schon vom Nutzer
abgelegt wurde: Logo erscheint oben links, Klick führt (auch eingeloggt,
z. B. von `/shop` aus) zurück zu `/`. Falls die Datei noch fehlt: gebrochenes
Bildsymbol ist an dieser Stelle erwartet und kein Bug in diesem Task – sobald
die Datei unter `public/logo/logo.svg` liegt, erscheint sie ohne
Codeänderung.

- [ ] **Step 5: Commit**

```bash
git add components/header.tsx
git commit -m "feat(header): Bild-Logo statt Wortmarke, verlinkt immer auf Startseite"
```

---

### Task 9: Server Action `submitAccessRequest`

**Files:**
- Create: `lib/actions/access-requests.ts`

**Interfaces:**
- Consumes: `createClient` aus `lib/supabase/server.ts`.
- Produces: `interface AccessRequestFormState { error?: string; success?:
  string }`, `submitAccessRequest(prevState: AccessRequestFormState,
  formData: FormData): Promise<AccessRequestFormState>` – erwartet
  `company_name`, `contact_name`, `email`, `phone` (optional),
  `billing_address`, `same_address` (Checkbox, `"on"` oder leer),
  `shipping_address` (nur Pflicht, wenn `same_address` nicht gesetzt),
  `message` (optional). Wird von `AccessRequestForm` (Task 10) konsumiert.

- [ ] **Step 1: Datei schreiben**

```ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface AccessRequestFormState {
  error?: string;
  success?: string;
}

const requestSchema = z
  .object({
    company_name: z.string().trim().min(1, "Firma fehlt").max(120),
    contact_name: z.string().trim().min(1, "Ansprechpartner fehlt").max(120),
    email: z.string().trim().toLowerCase().email("Keine gültige E-Mail-Adresse"),
    phone: z.string().trim().max(50).optional(),
    billing_address: z.string().trim().min(1, "Rechnungsadresse fehlt").max(500),
    same_address: z.boolean(),
    shipping_address: z.string().trim().max(500).optional(),
    message: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => data.same_address || (data.shipping_address ?? "").length > 0,
    { message: "Versandadresse fehlt", path: ["shipping_address"] },
  );

/**
 * Speichert die Anfrage nur – kein E-Mail-Versand (kein SMTP-Anbieter im
 * Projekt hinterlegt, siehe lib/actions/admin-customers.ts). Der Admin sieht
 * neue Anfragen unter /admin/zugangsanfragen und legt den Kunden dort manuell
 * an, genau wie jede andere Kundenanlage im Projekt auch.
 */
export async function submitAccessRequest(
  _prevState: AccessRequestFormState,
  formData: FormData,
): Promise<AccessRequestFormState> {
  const parsed = requestSchema.safeParse({
    company_name: formData.get("company_name"),
    contact_name: formData.get("contact_name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    billing_address: formData.get("billing_address"),
    same_address: formData.get("same_address") === "on",
    shipping_address: formData.get("shipping_address") || undefined,
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    company_name: data.company_name,
    contact_name: data.contact_name,
    email: data.email,
    phone: data.phone || null,
    billing_address: data.billing_address,
    shipping_address: data.same_address
      ? data.billing_address
      : (data.shipping_address as string),
    message: data.message || null,
  });

  if (error) {
    console.error("[zugang] Anfrage speichern:", error.message);
    return { error: "Die Anfrage konnte nicht gesendet werden." };
  }

  return { success: "Anfrage eingegangen. Wir melden uns bei Ihnen." };
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/access-requests.ts
git commit -m "feat(zugang): Server Action für Zugangsanfragen"
```

---

### Task 10: `AccessRequestForm`-Komponente

**Files:**
- Create: `components/forms/access-request-form.tsx`

**Interfaces:**
- Consumes: `submitAccessRequest` aus Task 9, `Checkbox`/`Input`/`Label`/
  `Textarea`/`Button` aus `components/ui/*`.
- Produces: `AccessRequestForm()` (keine Props) – wird von `app/page.tsx`
  (Task 11) konsumiert.

- [ ] **Step 1: Datei schreiben**

```tsx
"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitAccessRequest,
  type AccessRequestFormState,
} from "@/lib/actions/access-requests";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Wird gesendet …" : "Anfrage senden"}
    </Button>
  );
}

export function AccessRequestForm() {
  const [state, formAction] = useActionState<
    AccessRequestFormState,
    FormData
  >(submitAccessRequest, {});
  const [sameAddress, setSameAddress] = useState(true);

  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
      >
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="company_name">Firma</Label>
        <Input id="company_name" name="company_name" required maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact_name">Ansprechpartner</Label>
        <Input id="contact_name" name="contact_name" required maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefon</Label>
        <Input id="phone" name="phone" type="tel" maxLength={50} />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="billing_address">Rechnungsadresse</Label>
        <Textarea
          id="billing_address"
          name="billing_address"
          rows={3}
          maxLength={500}
          required
          placeholder="Firma, Straße, PLZ Ort"
        />
      </div>

      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id="same_address"
          name="same_address"
          checked={sameAddress}
          onCheckedChange={(checked) => setSameAddress(checked === true)}
        />
        <Label htmlFor="same_address" className="font-normal">
          Versandadresse identisch mit Rechnungsadresse
        </Label>
      </div>

      {sameAddress ? null : (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="shipping_address">Versandadresse</Label>
          <Textarea
            id="shipping_address"
            name="shipping_address"
            rows={3}
            maxLength={500}
            required
            placeholder="Firma, Straße, PLZ Ort"
          />
        </div>
      )}

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="message">Nachricht</Label>
        <Textarea id="message" name="message" rows={3} maxLength={2000} />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2"
        >
          {state.error}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
```

Hinweis zur Checkbox: `Checkbox` (Radix) rendert bei gesetztem `name` ein
verstecktes natives Input mit demselben Namen und Wert, der Formular-Wert
kommt also über `formData.get("same_address")` als `"on"` an, exakt wie bei
`is_active` in `components/forms/product-form.tsx` – hier zusätzlich
kontrolliert (`checked`/`onCheckedChange`), weil das UI reaktiv das zweite
Textfeld ein-/ausblenden muss.

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add components/forms/access-request-form.tsx
git commit -m "feat(zugang): Formular-Komponente für Zugangsanfragen"
```

---

### Task 11: Formular auf der Landingpage einbinden

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `AccessRequestForm` aus Task 10.
- Produces: ersetzt den bisherigen reinen Text-Teaser der `#kontakt`-Sektion
  durch das Formular, behält die bestehenden Kontakt-Platzhalter darunter.

- [ ] **Step 1: Import ergänzen**

```ts
import { AccessRequestForm } from "@/components/forms/access-request-form";
```

- [ ] **Step 2: Sektion umbauen**

Den bestehenden Block:

```tsx
      {/* Kontakt */}
      <section id="kontakt" className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow text-muted-foreground">Kontakt</p>
        <h2 className="headline mt-3 text-3xl font-bold">Zugang anfragen</h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Das Portal steht ausschließlich Gewerbekunden offen. Nennen Sie uns
          Firma, Ansprechpartner und Gewerbenachweis – wir richten den Zugang ein
          und schicken die Zugangsdaten per E-Mail.
        </p>

        <dl className="mt-8 grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Telefon</dt>
            <dd className="mt-1 font-medium">[TELEFON]</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">E-Mail</dt>
            <dd className="mt-1 font-medium">[E-MAIL]</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Anschrift</dt>
            <dd className="mt-1 font-medium">[STRASSE, PLZ ORT]</dd>
          </div>
        </dl>
      </section>
```

ersetzen durch:

```tsx
      {/* Kontakt */}
      <section id="kontakt" className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow text-muted-foreground">Kontakt</p>
        <h2 className="headline mt-3 text-3xl font-bold">Zugang anfragen</h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Das Portal steht ausschließlich Gewerbekunden offen. Füllen Sie das
          Formular aus – wir richten den Zugang ein und schicken die
          Zugangsdaten per E-Mail.
        </p>

        <div className="mt-8 max-w-2xl">
          <AccessRequestForm />
        </div>

        <dl className="mt-12 grid gap-6 border-t border-border pt-8 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Telefon</dt>
            <dd className="mt-1 font-medium">[TELEFON]</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">E-Mail</dt>
            <dd className="mt-1 font-medium">[E-MAIL]</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Anschrift</dt>
            <dd className="mt-1 font-medium">[STRASSE, PLZ ORT]</dd>
          </div>
        </dl>
      </section>
```

Der CTA-Button „Zugang anfragen" im Hero (Zeile ~82, `<Link
href="#kontakt">Zugang anfragen</Link>`) bleibt unverändert – er springt
weiterhin zur selben Sektion, die jetzt das Formular enthält.

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Manuell im Browser prüfen**

`npm run dev`, `/` öffnen (nicht eingeloggt), zu „Zugang anfragen"
scrollen/klicken: Formular ausfüllen (Checkbox „identisch" einmal an, einmal
aus testen – zweites Adressfeld erscheint), absenden. Danach: Bestätigungstext
sichtbar, kein Redirect. In Supabase (Table Editor) prüfen: neue Zeile in
`access_requests`.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat(landing): Zugangsanfrage-Formular statt reiner Kontakt-Platzhalter"
```

---

### Task 12: Admin-Queries für Zugangsanfragen

**Files:**
- Modify: `lib/queries/admin.ts`

**Interfaces:**
- Consumes: `createClient` (bereits importiert), `AccessRequest` aus Task 2.
- Produces: `getAccessRequests(status?: string): Promise<AccessRequest[]>`,
  `getAccessRequest(id: string): Promise<AccessRequest | null>` – werden von
  Task 15/17 konsumiert.

- [ ] **Step 1: Import ergänzen**

Die bestehende Type-Import-Zeile:

```ts
import type {
  AppUser,
  Order,
  OrderItem,
  Product,
  ProductVariant,
} from "@/lib/types";
```

ersetzen durch:

```ts
import type {
  AccessRequest,
  AppUser,
  Order,
  OrderItem,
  Product,
  ProductVariant,
} from "@/lib/types";
```

- [ ] **Step 2: Query-Funktionen anfügen**

Am Ende von `lib/queries/admin.ts` anfügen:

```ts
export async function getAccessRequests(status?: string): Promise<AccessRequest[]> {
  const supabase = await createClient();

  let query = supabase
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] Zugangsanfragen:", error.message);
    return [];
  }
  return (data ?? []) as AccessRequest[];
}

export async function getAccessRequest(id: string): Promise<AccessRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin] Zugangsanfrage-Detail:", error.message);
    return null;
  }
  return (data as AccessRequest) ?? null;
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/admin.ts
git commit -m "feat(admin): Queries für Zugangsanfragen"
```

---

### Task 13: Server Action `updateAccessRequestStatus`

**Files:**
- Create: `lib/actions/admin-access-requests.ts`

**Interfaces:**
- Consumes: `requireAdmin` aus `lib/auth.ts`, `createClient`,
  `AdminFormState` aus `lib/actions/admin-categories.ts`,
  `ACCESS_REQUEST_STATUS_LABELS`/`AccessRequestStatus` aus `lib/types.ts`.
- Produces: `updateAccessRequestStatus(prevState: AdminFormState, formData:
  FormData): Promise<AdminFormState>` – erwartet Felder `id`, `status`. Wird
  von `AccessRequestStatusSelect` (Task 14) konsumiert.

- [ ] **Step 1: Datei schreiben**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_REQUEST_STATUS_LABELS } from "@/lib/types";
import type { AdminFormState } from "@/lib/actions/admin-categories";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "done"]),
});

export async function updateAccessRequestStatus(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Ungültiger Status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("access_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] Zugangsanfrage-Status:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }

  revalidatePath("/admin/zugangsanfragen");
  revalidatePath(`/admin/zugangsanfragen/${parsed.data.id}`);
  return {
    success: `Status auf „${ACCESS_REQUEST_STATUS_LABELS[parsed.data.status]}“ gesetzt.`,
  };
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/admin-access-requests.ts
git commit -m "feat(admin): Server Action für Status von Zugangsanfragen"
```

---

### Task 14: `AccessRequestStatusSelect`-Komponente

**Files:**
- Create: `components/admin/access-request-status-select.tsx`

**Interfaces:**
- Consumes: `updateAccessRequestStatus` aus Task 13,
  `ACCESS_REQUEST_STATUS_LABELS`/`AccessRequestStatus` aus `lib/types.ts`.
- Produces: `AccessRequestStatusSelect({ requestId, status }: { requestId:
  string; status: AccessRequestStatus })` – wird von Task 17 konsumiert.

- [ ] **Step 1: Datei schreiben**

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateAccessRequestStatus } from "@/lib/actions/admin-access-requests";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import {
  ACCESS_REQUEST_STATUS_LABELS,
  type AccessRequestStatus,
} from "@/lib/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "…" : "Übernehmen"}
    </Button>
  );
}

export function AccessRequestStatusSelect({
  requestId,
  status,
}: {
  requestId: string;
  status: AccessRequestStatus;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateAccessRequestStatus,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={requestId} />
      <label htmlFor={`status-${requestId}`} className="sr-only">
        Status
      </label>
      <select
        id={`status-${requestId}`}
        name="status"
        defaultValue={status}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {(Object.keys(ACCESS_REQUEST_STATUS_LABELS) as AccessRequestStatus[]).map(
          (value) => (
            <option key={value} value={value}>
              {ACCESS_REQUEST_STATUS_LABELS[value]}
            </option>
          ),
        )}
      </select>
      <SaveButton />
    </form>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add components/admin/access-request-status-select.tsx
git commit -m "feat(admin): Status-Auswahl für Zugangsanfragen"
```

---

### Task 15: Admin-Listenseite `/admin/zugangsanfragen`

**Files:**
- Create: `app/admin/zugangsanfragen/page.tsx`
- Create: `app/admin/zugangsanfragen/loading.tsx`

**Interfaces:**
- Consumes: `getAccessRequests` aus Task 12,
  `ACCESS_REQUEST_STATUS_LABELS`/`AccessRequestStatus` aus `lib/types.ts`,
  `formatDate` aus `lib/format.ts`.
- Produces: Seite mit Status-Filter-Tabs und Tabelle, jede Zeile verlinkt
  auf `/admin/zugangsanfragen/[id]` (Task 17).

- [ ] **Step 1: Listenseite schreiben**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getAccessRequests } from "@/lib/queries/admin";
import {
  ACCESS_REQUEST_STATUS_LABELS,
  type AccessRequestStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Zugangsanfragen" };

function isStatus(value: string): value is AccessRequestStatus {
  return value in ACCESS_REQUEST_STATUS_LABELS;
}

export default async function AdminAccessRequestsPage({
  searchParams,
}: PageProps<"/admin/zugangsanfragen">) {
  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : "";
  const status = isStatus(raw) ? raw : undefined;

  const requests = await getAccessRequests(status);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Zugangsanfragen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Anfragen von der Landingpage. Zugänge werden weiterhin nur unter
        „Kunden" manuell angelegt.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {(["alle", ...Object.keys(ACCESS_REQUEST_STATUS_LABELS)] as const).map(
          (value) => {
            const active =
              value === "alle" ? status === undefined : status === value;
            return (
              <Link
                key={value}
                href={
                  value === "alle"
                    ? "/admin/zugangsanfragen"
                    : `/admin/zugangsanfragen?status=${value}`
                }
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {value === "alle"
                  ? "Alle"
                  : ACCESS_REQUEST_STATUS_LABELS[value as AccessRequestStatus]}
              </Link>
            );
          },
        )}
      </nav>

      {requests.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Keine Zugangsanfragen in dieser Auswahl.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Firma</th>
                <th className="py-2 pr-4 font-medium">Ansprechpartner</th>
                <th className="py-2 pr-4 font-medium">E-Mail</th>
                <th className="py-2 pr-4 font-medium">Eingegangen</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 font-medium">{request.company_name}</td>
                  <td className="py-3 pr-4">{request.contact_name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{request.email}</td>
                  <td className="py-3 pr-4 tabular text-muted-foreground">
                    {formatDate(request.created_at)}
                  </td>
                  <td className="py-3 pr-4">
                    {ACCESS_REQUEST_STATUS_LABELS[request.status]}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/admin/zugangsanfragen/${request.id}`}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Ansehen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Loading-Skeleton schreiben**

```tsx
import { TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 flex gap-2 border-b border-border pb-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-24" />
        ))}
      </div>
      <div className="mt-6">
        <TableSkeleton columns={6} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/zugangsanfragen/page.tsx app/admin/zugangsanfragen/loading.tsx
git commit -m "feat(admin): Listenseite für Zugangsanfragen"
```

---

### Task 16: Admin-Nav ergänzen

**Files:**
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: sichtbarer Nav-Link „Zugangsanfragen" in der Admin-Kopfleiste.

- [ ] **Step 1: `ADMIN_LINKS` erweitern**

```ts
const ADMIN_LINKS = [
  { href: "/admin", label: "Übersicht" },
  { href: "/admin/products", label: "Artikel" },
  { href: "/admin/categories", label: "Kategorien" },
  { href: "/admin/customers", label: "Kunden" },
  { href: "/admin/orders", label: "Bestellungen" },
  { href: "/admin/zugangsanfragen", label: "Zugangsanfragen" },
];
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat(admin): Nav-Link für Zugangsanfragen"
```

---

### Task 17: Admin-Detailseite `/admin/zugangsanfragen/[id]`

**Files:**
- Create: `app/admin/zugangsanfragen/[id]/page.tsx`

**Interfaces:**
- Consumes: `getAccessRequest` aus Task 12, `AccessRequestStatusSelect` aus
  Task 14, `formatDate` aus `lib/format.ts`.
- Produces: Detailansicht mit allen Feldern, Statuswahl, Link zurück zur
  Liste, Link zu `/admin/customers` für die manuelle Kundenanlage.

- [ ] **Step 1: Datei schreiben**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AccessRequestStatusSelect } from "@/components/admin/access-request-status-select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getAccessRequest } from "@/lib/queries/admin";

export async function generateMetadata({
  params,
}: PageProps<"/admin/zugangsanfragen/[id]">): Promise<Metadata> {
  const { id } = await params;
  const request = await getAccessRequest(id);
  return { title: request ? request.company_name : "Zugangsanfrage" };
}

export default async function AdminAccessRequestDetailPage({
  params,
}: PageProps<"/admin/zugangsanfragen/[id]">) {
  const { id } = await params;
  const request = await getAccessRequest(id);
  if (!request) notFound();

  return (
    <div>
      <Link
        href="/admin/zugangsanfragen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Zugangsanfragen
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {request.company_name}
        </h1>
        <AccessRequestStatusSelect requestId={request.id} status={request.status} />
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Eingegangen</dt>
          <dd className="mt-1 tabular">{formatDate(request.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ansprechpartner</dt>
          <dd className="mt-1">{request.contact_name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-Mail</dt>
          <dd className="mt-1 break-all">{request.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telefon</dt>
          <dd className="mt-1">{request.phone || "–"}</dd>
        </div>
      </dl>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-medium">Rechnungsadresse</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {request.billing_address}
          </p>
        </section>
        <section>
          <h2 className="font-medium">Versandadresse</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {request.shipping_address}
          </p>
        </section>
      </div>

      {request.message ? (
        <section className="mt-8">
          <h2 className="font-medium">Nachricht</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {request.message}
          </p>
        </section>
      ) : null}

      <div className="mt-10 rounded-md border border-border p-5">
        <h2 className="font-medium">Zugang anlegen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Legt hier keinen Kunden automatisch an – öffnen Sie „Kunden" und
          tragen Sie E-Mail, Ansprechpartner und Firma aus dieser Anfrage
          ein.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/customers">Zu den Kunden</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Manuell im Browser prüfen**

Als Admin einloggen, `/admin/zugangsanfragen` öffnen: die in Task 11
eingereichte Test-Anfrage ist gelistet. Auf „Ansehen" klicken: alle Felder
korrekt, Status auf „Kontaktiert" setzen, „Übernehmen" klicken → Toast
„Status auf „Kontaktiert" gesetzt.", Filter-Tab „Kontaktiert" zeigt die
Anfrage jetzt auch dort.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/zugangsanfragen/[id]/page.tsx"
git commit -m "feat(admin): Detailseite für Zugangsanfragen"
```

---

### Task 18: Lint über das Gesamtprojekt

**Files:** keine Änderungen, nur Prüfung.

- [ ] **Step 1: Lint laufen lassen**

Run: `npm run lint`
Expected: keine Fehler. Bei Warnungen zu in diesem Plan neu angelegten
Dateien: beheben. Bestehende Warnungen außerhalb der geänderten Dateien
bleiben unangetastet (nicht Teil dieses Plans).

- [ ] **Step 2: Vollständigen Build laufen lassen**

Run: `npm run build`
Expected: `Compiled successfully`, keine Type-Fehler.

- [ ] **Step 3: Commit (nur falls Lint-Fixes nötig waren)**

```bash
git add -A
git commit -m "fix: Lint-Hinweise aus Logo/Zugang/Konto-Feature beheben"
```

Falls keine Änderungen nötig waren: diesen Schritt auslassen, kein leerer
Commit.
