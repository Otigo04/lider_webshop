# Design: Logo, Zugangsanfrage-Formular, Konto-Adressen

Datum: 2026-08-06

## Kontext

Vier zusammenhängende Änderungen an bestehenden Bereichen:

1. Echtes Logo im Header statt Text-Wortmarke, klickbar zurück zur Startseite.
2. „Zugang anfragen" auf der Landingpage ist aktuell nur ein Anker-Link zu
   statischen Kontakt-Platzhaltern ([TELEFON], [E-MAIL]) – kein echtes
   Formular, nichts wird gespeichert.
3. `/account` existiert bereits (Stammdaten, Passwort), bekommt zusätzlich
   Rechnungs-/Versandadresse.
4. Die neue Versandadresse aus (3) füllt das `defaultAddress`-Feld im
   Checkout vor, das heute ungenutzt ist.

## 1. Logo

- Neuer Ordner `public/logo/` (bereits angelegt). Nutzer legt Datei dort als
  `public/logo/logo.svg` ab (SVG empfohlen wegen Schärfe auf dunklem Header;
  bei PNG genügt Umbenennen der Pfad-Referenz in `header.tsx`).
- `components/header.tsx`: Wortmarke „LIDER / Berlin · Großhandel" wird durch
  `<img src="/logo/logo.svg" alt="LIDER Großhandel" />` ersetzt (reines
  `<img>`, kein `next/image` nötig für ein statisches SVG im Header).
- Link-Ziel des Logos ist immer `/` – unabhängig vom Login-Status (bisher
  `user ? "/shop" : "/"`).
- Höhe an bestehende 56px-Headerleiste (`h-14`) anpassen, `object-contain`.

## 2. Zugangsanfrage-Formular

**Datenhaltung:** neue Tabelle `public.access_requests`, kein E-Mail-Versand
(Projekt hat keinen SMTP-Anbieter – Kundenanlage läuft schon heute komplett
manuell über den Admin, siehe `createCustomer`). Migration
`005_zugangsanfragen.sql`:

```sql
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
                     CHECK (status IN ('new','contacted','done')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Jeder (auch anonym) darf eine Anfrage einreichen, aber nichts lesen.
CREATE POLICY access_requests_insert_public ON public.access_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Nur Admins sehen/bearbeiten Anfragen.
CREATE POLICY access_requests_admin_all ON public.access_requests
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
```

**Formular** (`components/forms/access-request-form.tsx`, Client-Component,
`useActionState` wie bei `ProfileForm`), ersetzt den Kontakt-Block auf der
Landingpage (`app/page.tsx`, Sektion `#kontakt`):

- Firma * (Input)
- Ansprechpartner * (Input)
- E-Mail * (Input type=email)
- Telefon (Input, optional)
- Rechnungsadresse * (Textarea, Platzhalter „Firma, Straße, PLZ Ort")
- Checkbox „Versandadresse identisch mit Rechnungsadresse" (default an) –
  blendet ein zweites Textarea „Versandadresse" ein/aus, exakt das
  Interaktionsmuster, das `CheckoutForm` schon für die Liefermethode nutzt.
- Nachricht (Textarea, optional)
- Bei Erfolg: Formular weicht einer Bestätigungsmeldung („Anfrage
  eingegangen, wir melden uns.").

Server Action `lib/actions/access-requests.ts` → `submitAccessRequest`:
Zod-Validierung, bei angehakter Checkbox wird `shipping_address` serverseitig
mit `billing_address` gleichgesetzt, Insert über normalen (nicht Admin-)
Supabase-Client, da RLS anonymes Insert erlaubt. Kein Rate-Limiting (Scope
bewusst klein gehalten, YAGNI).

Die bestehenden Kontakt-Platzhalter (Telefon/E-Mail/Anschrift) bleiben unter
dem Formular stehen – weiterhin mit `[TELEFON]` usw. markiert, das ist
vorhandene, bewusst offene Pflicht aus dem Kopfkommentar der Datei.

**Admin-Ansicht** `app/admin/zugangsanfragen/page.tsx`, neuer Eintrag in
`ADMIN_LINKS` in `app/admin/layout.tsx` („Zugangsanfragen"). Tabelle wie
`/admin/customers`: Firma, Ansprechpartner, E-Mail, Telefon, Datum, Status.
Klick auf eine Zeile klappt Details (Adressen, Nachricht) auf. Statuswechsel
über einfaches Select/Button-Trio (neu → kontaktiert → erledigt), Server
Action `lib/actions/admin-access-requests.ts` (`updateAccessRequestStatus`),
Muster wie `toggleCustomerActive`. Kein automatisches „Kunde anlegen" mit
Vorausfüllung – Admin öffnet `/admin/customers` und trägt die Daten ein,
genau wie heute schon bei jeder Kundenanlage üblich (kein Scope-Zuwachs am
bestehenden Formular).

## 3. Konto-Adressen

`supabase/schema.sql` / Migration 005 (gleiche Datei wie oben, zweiter Teil):

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_address  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT;
```

`app/account/page.tsx`: neue Sektion „Adressen" zwischen „Stammdaten" und
„Passwort" mit neuer `AddressForm`-Komponente in
`components/forms/account-forms.tsx` (gleiches Muster wie `ProfileForm`):
zwei Textareas, Rechnungsadresse und Versandadresse, beide optional, je
Freitext (konsistent mit dem bestehenden `delivery_address`-Freitextfeld im
Checkout). Neue Server Action `updateAddresses` in `lib/actions/account.ts`.

`lib/types.ts`: `AppUser` bekommt `billing_address: string | null` und
`shipping_address: string | null`.

## 4. Checkout-Vorbefüllung

`app/checkout/page.tsx` übergibt `defaultAddress={user.shipping_address ??
undefined}` an `<CheckoutForm />` – der Prop existiert bereits, wird aktuell
nur nirgends gesetzt.

## Nicht im Scope

- Kein E-Mail-Versand/Benachrichtigung bei neuer Zugangsanfrage (kein
  SMTP-Anbieter vorhanden, würde Marketplace-Integration erfordern – bewusst
  ausgeklammert, Admin sieht neue Anfragen beim nächsten Besuch der
  Admin-Seite).
- Keine automatische Kundenanlage aus einer Zugangsanfrage heraus.
- Keine strukturierten Adressfelder (Straße/PLZ/Ort getrennt) – Freitext wie
  beim bestehenden `delivery_address`, um das Muster im Projekt konsistent zu
  halten.
