# Admin-Push: Benachrichtigungen bei neuen Bestellungen und Neukunden

Stand: 2026-10-29 · Status: Entwurf zur Prüfung

## Ziel

Der Admin (Orhan) bekommt auf iPhone und Mac eine Mitteilung, sobald

1. ein Kunde im Shop eine Bestellung abgeschickt hat,
2. sich ein neuer Kunde registriert hat.

Die Mitteilung muss zuverlässig ankommen („nie eine Bestellung verschlafen"),
schlicht aussehen und nur an Admin-Konten gehen. Welche der beiden Arten ein
Gerät bekommt, ist **pro Gerät** in den persönlichen Einstellungen (`/account`)
schaltbar.

## Nicht Teil dieser Arbeit

- Storno-/Änderungs-Push: Kunden können Bestellungen heute weder stornieren noch
  ändern, es gäbe keinen Auslöser. Nachrüsten, sobald es den Weg gibt.
- Bestandswarnung, Erinnerung „Bestellung seit X Minuten unbeachtet".
- E-Mail als zweiter Kanal (Resend hat noch keine Domain, siehe Memory
  „Resend-Setup pending").
- Push an Kunden.
- Bestellungen, die der Admin selbst anlegt (Telefon, Kasse, „Rechnung aus
  Katalog"): lösen nichts aus.

## Ansatz

Eigenes Web-Push nach VAPID/RFC 8030 mit dem Paket `web-push`, Service Worker im
Browser, Geräteabos in Supabase. Kein Drittanbieter. Gewählt gegenüber
OneSignal-ähnlichen Diensten (Kundendaten bei Dritten, Fremd-SDK, Kosten) und
gegenüber DB-Trigger + Edge Function (mehr Infrastruktur; beide Auslöser laufen
ohnehin durch je eine Server-Action).

### Plattform-Randbedingung iPhone

iOS liefert Web-Push **nur** an eine zum Home-Bildschirm hinzugefügte Web-App
(iOS 16.4+). Deshalb braucht das Projekt ein Web-App-Manifest, und die
Einstellungsseite führt den Admin durch „Teilen → Zum Home-Bildschirm", bevor
sie die Erlaubnis anfragt. Auf dem Mac (Chrome, Safari 16+) und Android genügt
der normale Browser.

iOS **entzieht ein Abo**, wenn ein Push nicht als sichtbare Mitteilung endet.
Der Service Worker zeigt deshalb jeden Push immer an, auch bei leerem oder
defektem Inhalt (Rückfalltext).

## 1. Daten (Migration 082, idempotent)

Tabelle `public.push_subscriptions`:

| Spalte | Typ | Bedeutung |
|--------|-----|-----------|
| `id` | uuid PK, `gen_random_uuid()` | |
| `user_id` | uuid NOT NULL → `users(id)` ON DELETE CASCADE | Besitzer |
| `endpoint` | text NOT NULL UNIQUE | Push-Adresse des Browsers |
| `p256dh` | text NOT NULL | Schlüssel |
| `auth` | text NOT NULL | Schlüssel |
| `geraet` | text NOT NULL | Anzeigename, aus User-Agent („iPhone", „Mac · Safari", …) |
| `bei_bestellung` | boolean NOT NULL DEFAULT true | |
| `bei_neukunde` | boolean NOT NULL DEFAULT true | |
| `zuletzt_ok` | timestamptz | letzter erfolgreicher Versand |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Index auf `user_id`.

**Rechte (RLS):** aktiv. Policies: Admins dürfen eigene Zeilen lesen, ändern und
löschen (`user_id = auth.uid()` und Rolle `admin`). Angelegt und versendet wird
über Server Actions; der Versand nutzt den Service-Key (`createAdminClient()`),
nie den Browser. Kunden haben keinen Zugriff.

**Empfängerfilter beim Versand:** Zeile zählt nur, wenn Besitzer
`role = 'admin' AND is_active` ist und der passende Schalter an ist. Wird ein
Konto herabgestuft oder deaktiviert, hört der Versand von selbst auf.

Der Zähler für ungesehene Bestellungen braucht **kein** neues Feld; er zählt
Bestellungen im Anfangsstatus (siehe Abschnitt 4).

## 2. Versand (Server)

- **`lib/push-text.ts`** (rein, ohne Abhängigkeiten, getestet)
  - `bestellungText({ orderNumber, kunde, gesamt })` →
    `{ title: "Neue Bestellung", body: "LG-2026-00012 · Müller GmbH · 234,50 €", url: "/admin/orders/<id>", tag: "order-<id>" }`
  - `neukundeText({ firma|name, ort })` →
    `{ title: "Neuer Kunde", body: "Müller GmbH · Berlin", url: "/admin/customers/<id>", tag: "kunde-<id>" }`
  - Betrag über `lib/format.ts`. Fehlende Felder werden weggelassen, nie „undefined".
  - Keine Einkaufspreise, keine Positionsdetails (harte Regel).
- **`lib/push.ts`** (`server-only`)
  - `sendeAnAdmins(art: "bestellung" | "neukunde", payload)`: lädt passende
    Abos (Filter siehe oben), sendet parallel mit `web-push`
    (`TTL` 24 h, `urgency: high`), setzt `zuletzt_ok` bei Erfolg, löscht Abos bei
    HTTP 404/410, loggt alle anderen Fehler. **Wirft nie.**
  - `sendeTest(subscriptionId)`: gleiche Mechanik für ein Gerät, liefert dem
    Aufrufer das Ergebnis (gesendet / Abo tot und entfernt / Fehler).
  - Fehlen die VAPID-Schlüssel: Warnung ins Log, Rückgabe, keine Wirkung (wie
    `lib/email.ts` ohne `RESEND_API_KEY`).
- **Auslöser**
  - `lib/actions/orders.ts` → `createOrder`: nach erfolgreichem
    RPC `create_order` und vor dem Rückgabewert `after(() => sendeAnAdmins("bestellung", …))`.
  - `lib/actions/auth.ts` → `signUp`: nach erfolgreich angelegtem Profil
    `after(() => sendeAnAdmins("neukunde", …))`.
  - `after()` aus `next/server`: der Push blockiert die Antwort an den Kunden
    nicht, die Funktion bleibt bis zum Versand am Leben. Ein Pushfehler kann
    Bestellung oder Registrierung nie scheitern lassen.
- **Server Actions `lib/actions/push.ts`**, alle mit `requireAdmin()` und
  Zod-Schema:
  - `abonniere({ endpoint, keys, userAgent })`: Upsert nach `endpoint`
    (bei bestehendem Endpoint Schlüssel und `user_id` aktualisieren, Schalter
    nicht überschreiben).
  - `setzeSchalter({ id, bei_bestellung?, bei_neukunde? })`
  - `entferneGeraet({ id })`
  - `testeGeraet({ id })`
- **Umgebung:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` (https-Adresse des Shops, `https://www.lider-berlin.de`; eine private Mailadresse geht nicht an die Push-Dienste von Apple/Google).
  Schlüsselpaar wird lokal erzeugt (`web-push generate-vapid-keys`) und in
  `.env.local` sowie in Vercel eingetragen. Das Eintragen in Vercel erfolgt nur
  nach ausdrücklicher Freigabe.

## 3. Gerät und Browser

- **`public/sw.js`**: `push`-Ereignis → `showNotification(title, { body, tag,
  data: { url }, icon, badge })`, immer, mit Rückfalltext „Neue Meldung bei
  LIDER". `notificationclick` → vorhandenes Fenster auf die Ziel-URL fokussieren
  und navigieren, sonst `clients.openWindow(url)`. `tag` je Bestellung verhindert
  doppelte Mitteilungen. Kein Caching, kein `fetch`-Handler.
  Ausgeliefert mit `Cache-Control: no-cache` (Header in `next.config.ts`), damit
  Updates des Workers sofort greifen.
- **Icons:** `logo-mark.png` (480 px) als Mitteilungs- und App-Symbol; für
  `apple-touch-icon` ein 180-px-Ableitung (Skript im Projektstil, wie
  `logo-print.png`). Zugriff über `lib/logo.ts`, nicht über den Pfad.
- **`app/manifest.ts`**: Name „LIDER Admin", `start_url: "/admin"`, `scope: "/"`,
  `display: "standalone"`, Farben aus `app/globals.css` (`--brand`), Icons
  192/512 aus dem Wappen. `app/layout.tsx`: `appleWebApp`-Metadaten.
- **`proxy.ts`**: `/sw.js` und `/manifest.webmanifest` in die
  Wartungs-Ausnahmen aufnehmen, damit Worker und Manifest nie auf `/wartung`
  umgeleitet werden.
- **Einstellungsseite** `/account` (nur wenn `user.role === 'admin'`), Abschnitt
  „Benachrichtigungen", Client-Komponente
  `components/admin/push-einstellungen.tsx`:
  - Zustände für das **aktuelle Gerät**:
    1. nicht unterstützt → Hinweistext,
    2. iPhone/iPad, nicht als App installiert → Anleitung „Teilen → Zum
       Home-Bildschirm, dann dort öffnen",
    3. Erlaubnis noch offen → Knopf „Benachrichtigungen aktivieren" (die
       Browserabfrage nur auf Klick, nie automatisch),
    4. aktiv,
    5. im Browser blockiert → Hinweis, wo man es wieder freigibt.
  - Liste aller Geräte des Admins: Name, „dieses Gerät"-Marke, zuletzt
    erfolgreich, zwei Schalter („Neue Bestellung", „Neuer Kunde"), „Test
    senden", „Entfernen". Schalter speichern sofort.
  - Gestaltung wie die übrigen Kontoabschnitte, klassisch-sachlich, keine
    Sonderoptik.
- **`PushSync`** (Client-Komponente, im Admin-Layout eingebunden): ist die
  Erlaubnis erteilt, prüft sie bei jedem Besuch `pushManager.getSubscription()`;
  fehlt das Abo oder weicht der Endpoint ab, wird neu abonniert und
  `abonniere` aufgerufen. Fängt abgelaufene und vom System entzogene Abos ab.
  Zeigt nichts an.

## 4. Absicherung gegen Verschlafen

1. **Selbstheilung:** `PushSync` bei jedem Admin-Besuch; tote Abos werden beim
   Versand entfernt; `zuletzt_ok` zeigt in der Geräteliste, ob ein Gerät noch
   erreichbar ist.
2. **Test-Knopf** je Gerät: sendet sofort eine Probe und meldet das Ergebnis.
3. **Zähler im Admin:** der Reiter „Bestellungen" in `app/admin/layout.tsx`
   zeigt die Zahl der Bestellungen im Anfangsstatus (Kundenbestellung
   eingegangen, aktuell `submitted`; im Plan gegen `createOrder` /
   Bestellablauf-Spec 2026-10-15 prüfen, welcher Status gilt). Ein ausbleibender
   Push fällt so beim nächsten Öffnen des Admins auf.
4. **Mehrere Geräte:** jedes Gerät hat eigenes Abo; fällt eines aus (Akku,
   Fokusmodus), kommt die Mitteilung auf den anderen an.

## Fehlerbehandlung

| Fall | Verhalten |
|------|-----------|
| VAPID-Schlüssel fehlen | Log-Warnung, kein Versand, Bestellung unberührt |
| Push-Dienst antwortet 404/410 | Abo wird gelöscht |
| Push-Dienst antwortet sonst mit Fehler/Zeitüberschreitung | loggen, Abo behalten |
| Kein Abo mit passendem Schalter | still nichts tun |
| Browser ohne Push-Unterstützung | Zustand 1 in den Einstellungen |
| Erlaubnis verweigert | Zustand 5, kein erneutes Fragen |
| Server Action ohne Admin-Rolle | `requireAdmin()` verweigert |

Fehlermeldungen an den Admin in verständlichem Deutsch, nicht technisch.

## Tests

- `tests/push-text.test.ts` (Node-Testrunner, wie `npm test` sonst):
  Titel/Text/URL/Tag beider Arten; fehlende Felder; Beträge im deutschen
  Format; kein „undefined" im Text.
- Auswahl der Empfänger (Schalter × Rolle × aktiv) als reine Funktion in
  `lib/push-text.ts` oder `lib/push-ziele.ts`, getestet.
- Echtversand und iOS-Verhalten lassen sich nicht automatisiert prüfen:
  Abnahme per Test-Knopf auf iPhone (installierte App) und Mac, danach je eine
  echte Probebestellung und Probe-Registrierung.
- Vor dem Commit: `npm test`, `npm run lint`, `npm run build`,
  `npm run check:migrations`.

## Betroffene Dateien

Neu: `supabase/migrations/082_push_subscriptions.sql`, `lib/push-text.ts`,
`lib/push.ts`, `lib/actions/push.ts`, `public/sw.js`, `app/manifest.ts`,
`components/admin/push-einstellungen.tsx`, `components/admin/push-sync.tsx`,
`tests/push-text.test.ts`, Apple-Touch-Icon.

Geändert: `lib/actions/orders.ts`, `lib/actions/auth.ts`, `app/account/page.tsx`,
`app/admin/layout.tsx`, `app/layout.tsx`, `proxy.ts`, `next.config.ts`,
`package.json` (`web-push`, `@types/web-push`), `.env.local.example`,
`supabase/schema.sql` (Tabelle ergänzen), `CLAUDE.md` (kurzer Abschnitt
„Admin-Push") und `docs/` (Betrieb: Schlüssel, iPhone-Einrichtung).

## Offene Punkte für den Plan

- Welcher Bestellstatus zählt als „neu eingegangen" (Zähler, Abschnitt 4)?
- Ob `users` die Ortsangabe für den Neukundentext direkt trägt oder sie aus der
  Adresse gelesen werden muss.
- Migration 082 im Supabase SQL-Editor einspielen (manueller Schritt, wie bei
  den bisherigen Migrationen, siehe `docs/betrieb.md`).
