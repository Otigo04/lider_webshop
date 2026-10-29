# Admin-Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-Konten bekommen auf iPhone (installierte Web-App) und Mac eine Web-Push-Mitteilung bei jeder neuen Kundenbestellung und jeder neuen Registrierung; je Gerät in `/account` schaltbar.

**Architecture:** Eigenes Web-Push (VAPID, Paket `web-push`). Geräteabos liegen in `push_subscriptions` (Supabase, RLS nur Besitzer-Admin). `createOrder` und `signUp` lösen nach erfolgreichem Buchen per `after()` den Versand aus; der Versand wirft nie. Ein Service Worker (`public/sw.js`) zeigt jeden Push an. Reine Logik (Texte, Empfängerfilter, Zustandsermittlung) steht in getesteten Modulen ohne Abhängigkeiten.

**Tech Stack:** Next.js 16 (App Router, `after`), TypeScript, Supabase, `web-push`, Zod, Node-Testrunner (`npm test`), sonner (Toasts), shadcn-Komponenten.

Spec: `docs/superpowers/specs/2026-10-29-admin-push-design.md`

## Global Constraints

- Gebucht wird in der Datenbank; Push ist reine Nebenwirkung **nach** erfolgreichem Buchen und darf Bestellung/Registrierung nie scheitern lassen (`lib/push.ts` wirft nie).
- Nur Admin-Konten (`role = 'admin'` und `is_active`) bekommen Push; Server Actions mit `requireAdmin()` und Zod-Schema.
- Der Einkaufspreis und Positionsdetails stehen nie in einer Mitteilung. Mitteilung enthält nur: Bestellnummer, Kundenname, Gesamtbetrag bzw. Firma/Name, Ort.
- Betrag formatiert über `formatPrice` aus `lib/format.ts` (deutsches Format).
- Der Service Worker zeigt **jeden** Push immer als sichtbare Mitteilung (iOS entzieht sonst das Abo), mit Rückfalltext „Neue Meldung bei LIDER".
- iPhone: Push nur für zum Home-Bildschirm hinzugefügte Web-App (iOS 16.4+); die Einstellungsseite führt durch „Teilen → Zum Home-Bildschirm".
- Datenbankänderung nur als neue, idempotente Migration `082_push_subscriptions.sql`; bestehende Migrationen nicht ändern.
- Kein Glasmorphism, keine Sonderoptik; Gestaltung wie die übrigen Kontoabschnitte (`rounded-md border border-border p-6`, Kopf mit `tag-N`-Symbol).
- Texte der Oberfläche auf Deutsch, verständlich, nicht technisch.
- Vor jedem Commit: `npm test`, `npm run lint`; vor dem letzten: `npm run build`, `npm run check:migrations`.
- Commits mit Zeile `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` am Ende.
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Eintragen in Vercel nur nach ausdrücklicher Freigabe des Nutzers.

## Dateistruktur

| Datei | Zweck |
|-------|-------|
| `lib/push-text.ts` (neu) | Reine Funktionen: Titel/Text/URL/Tag der Mitteilungen |
| `lib/push-ziele.ts` (neu) | Reine Funktionen: Empfängerfilter, Gerätename, Fehlerbewertung, gemeinsame Typen |
| `lib/push-client.ts` (neu) | Browserseitig: Zustandsermittlung (rein) + dünne Browser-Hilfen (Service Worker, Abo) |
| `lib/push.ts` (neu, `server-only`) | Versand: `sendeAnGeraet`, `sendeAnAdmins`, `meldeNeueBestellung`, `meldeNeuenKunden` |
| `lib/actions/push.ts` (neu) | Server Actions: `abonniere`, `setzeSchalter`, `entferneGeraet`, `testeGeraet` |
| `supabase/migrations/082_push_subscriptions.sql` (neu) | Tabelle + RLS |
| `public/sw.js` (neu) | Service Worker |
| `app/manifest.ts`, `app/apple-icon.png` (neu) | Web-App-Manifest, iOS-Symbol |
| `scripts/push-icons.mjs` (neu) | erzeugt Symbole aus dem Wappen |
| `components/admin/push-einstellungen.tsx`, `components/admin/push-sync.tsx` (neu) | Oberfläche in `/account`, stille Abo-Erneuerung |
| `tests/push-text.test.ts`, `tests/push-ziele.test.ts`, `tests/push-client.test.ts` (neu) | Tests |

---

### Task 1: Mitteilungstexte (`lib/push-text.ts`)

**Files:**
- Create: `lib/push-text.ts`
- Test: `tests/push-text.test.ts`

**Interfaces:**
- Produces:
  - `interface PushNachricht { title: string; body: string; url: string; tag: string }`
  - `bestellungText(e: { id: string; orderNumber: string; kunde?: string | null; gesamt?: number | string | null }): PushNachricht`
  - `neukundeText(e: { id: string; firma?: string | null; name?: string | null; ort?: string | null }): PushNachricht`
  - `testText(): PushNachricht`

- [ ] **Step 1: Failing test schreiben**

`tests/push-text.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice } from "@/lib/format";
import { bestellungText, neukundeText, testText } from "@/lib/push-text";

test("Bestellung: Titel, Text mit Nummer, Kunde und Betrag, Ziel und Tag", () => {
  const n = bestellungText({
    id: "abc",
    orderNumber: "LG-2026-00012",
    kunde: "Müller GmbH",
    gesamt: 234.5,
  });
  assert.equal(n.title, "Neue Bestellung");
  assert.equal(n.body, `LG-2026-00012 · Müller GmbH · ${formatPrice(234.5)}`);
  assert.equal(n.url, "/admin/orders/abc");
  assert.equal(n.tag, "order-abc");
});

test("Bestellung: Betrag als Dezimal-String (PostgREST) wird deutsch formatiert", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", gesamt: "234.50" });
  assert.ok(n.body.includes("234,50"), n.body);
});

test("Bestellung: Betrag 0 wird gezeigt", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", gesamt: 0 });
  assert.ok(n.body.includes("0,00"), n.body);
});

test("Bestellung: fehlende Felder erscheinen nicht als undefined/null", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", kunde: null, gesamt: null });
  assert.equal(n.body, "LG-1");
  assert.ok(!/undefined|null/.test(n.body));
});

test("Bestellung: Kundenname wird getrimmt, Leerzeichen allein zählen als leer", () => {
  const n = bestellungText({ id: "x", orderNumber: "LG-1", kunde: "   " });
  assert.equal(n.body, "LG-1");
});

test("Neukunde: Firma und Ort", () => {
  const n = neukundeText({ id: "k1", firma: "Müller GmbH", name: "Anna Müller", ort: "Berlin" });
  assert.equal(n.title, "Neuer Kunde");
  assert.equal(n.body, "Müller GmbH · Berlin");
  assert.equal(n.url, "/admin/customers/k1");
  assert.equal(n.tag, "kunde-k1");
});

test("Neukunde: ohne Firma der Name, ohne Ort nur der Name", () => {
  const n = neukundeText({ id: "k1", firma: " ", name: "Anna Müller", ort: null });
  assert.equal(n.body, "Anna Müller");
});

test("Neukunde: ganz ohne Angaben ein Rückfalltext", () => {
  const n = neukundeText({ id: "k1" });
  assert.equal(n.body, "Neue Registrierung");
});

test("Test-Mitteilung zeigt auf das Konto", () => {
  const n = testText();
  assert.equal(n.title, "Test");
  assert.equal(n.url, "/account");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npm test -- --test-name-pattern="Bestellung|Neukunde|Test-Mitteilung"`
(Der Runner nimmt das Glob aus `package.json`; bei Unklarheit: `npm test`.)
Expected: FAIL, `Cannot find module '…/lib/push-text.ts'`.

- [ ] **Step 3: Minimal implementieren**

`lib/push-text.ts`:

```ts
import { formatPrice } from "@/lib/format";

/**
 * Inhalt einer Push-Mitteilung. Rein (kein server-only, keine Datenbank), damit
 * die Texte ohne Next getestet werden können. Niemals Einkaufspreise oder
 * Positionen hinein – eine Mitteilung liegt auf dem Sperrbildschirm.
 */
export interface PushNachricht {
  title: string;
  body: string;
  /** Interner Pfad; der Service Worker öffnet ihn beim Antippen. */
  url: string;
  /** Gleicher Tag ersetzt eine frühere Mitteilung – verhindert Doppelte. */
  tag: string;
}

/** Nicht leere Teile, getrimmt, mit „ · " verbunden. */
function teile(...werte: (string | null | undefined)[]): string {
  return werte
    .map((wert) => wert?.trim())
    .filter((wert): wert is string => Boolean(wert))
    .join(" · ");
}

export function bestellungText(e: {
  id: string;
  orderNumber: string;
  kunde?: string | null;
  gesamt?: number | string | null;
}): PushNachricht {
  const betrag = e.gesamt === null || e.gesamt === undefined ? null : formatPrice(e.gesamt);
  return {
    title: "Neue Bestellung",
    body: teile(e.orderNumber, e.kunde, betrag),
    url: `/admin/orders/${e.id}`,
    tag: `order-${e.id}`,
  };
}

export function neukundeText(e: {
  id: string;
  firma?: string | null;
  name?: string | null;
  ort?: string | null;
}): PushNachricht {
  return {
    title: "Neuer Kunde",
    body: teile(e.firma?.trim() || e.name, e.ort) || "Neue Registrierung",
    url: `/admin/customers/${e.id}`,
    tag: `kunde-${e.id}`,
  };
}

/** Für den Test-Knopf in den Einstellungen. */
export function testText(): PushNachricht {
  return {
    title: "Test",
    body: "Benachrichtigungen funktionieren auf diesem Gerät.",
    url: "/account",
    tag: "test",
  };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npm test`
Expected: alle Tests grün, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/push-text.ts tests/push-text.test.ts
git commit -m "$(cat <<'EOF'
feat(push): Mitteilungstexte für Bestellung und Neukunde

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Empfängerfilter, Gerätename, Zustandsermittlung

**Files:**
- Create: `lib/push-ziele.ts`, `lib/push-client.ts`
- Test: `tests/push-ziele.test.ts`, `tests/push-client.test.ts`

**Interfaces:**
- Produces (`lib/push-ziele.ts`):
  - `type PushArt = "bestellung" | "neukunde"`
  - `type SendeErgebnis = "gesendet" | "entfernt" | "fehler" | "nicht-konfiguriert"`
  - `interface Besitzer { role: string; is_active: boolean }`
  - `interface AboZeile { id: string; endpoint: string; p256dh: string; auth: string; bei_bestellung: boolean; bei_neukunde: boolean; users: Besitzer | Besitzer[] | null }`
  - `waehleEmpfaenger<T extends AboZeile>(zeilen: T[], art: PushArt): T[]`
  - `istAboTot(statusCode: number | undefined): boolean` (404/410)
  - `geraeteName(userAgent: string): string`
- Produces (`lib/push-client.ts`):
  - `type PushZustand = "nicht-unterstuetzt" | "ios-installieren" | "erlaubnis-offen" | "blockiert" | "aktiv"`
  - `ermittleZustand(e: { hatPush: boolean; istIos: boolean; istInstalliert: boolean; erlaubnis: NotificationPermission | "unbekannt"; abonniert: boolean }): PushZustand`
  - `istIosGeraet(e: { ua: string; plattform: string; touchPunkte: number }): boolean`
  - `urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer>`
  - Browser-Hilfen: `pushUnterstuetzt(): boolean`, `istInstalliert(): boolean`, `aktuellesAbo(): Promise<PushSubscription | null>`, `meldeAn(): Promise<PushSubscription>`, `aboDaten(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string; userAgent: string }`

- [ ] **Step 1: Failing tests schreiben**

`tests/push-ziele.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { geraeteName, istAboTot, waehleEmpfaenger, type AboZeile } from "@/lib/push-ziele";

function abo(teil: Partial<AboZeile> & { id: string }): AboZeile {
  return {
    endpoint: `https://push.example/${teil.id}`,
    p256dh: "p",
    auth: "a",
    bei_bestellung: true,
    bei_neukunde: true,
    users: { role: "admin", is_active: true },
    ...teil,
  };
}

test("Empfänger: Admin mit passendem Schalter", () => {
  const z = [abo({ id: "1" })];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung").map((a) => a.id), ["1"]);
  assert.deepEqual(waehleEmpfaenger(z, "neukunde").map((a) => a.id), ["1"]);
});

test("Empfänger: Schalter aus schließt nur diese Art aus", () => {
  const z = [abo({ id: "1", bei_bestellung: false }), abo({ id: "2", bei_neukunde: false })];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung").map((a) => a.id), ["2"]);
  assert.deepEqual(waehleEmpfaenger(z, "neukunde").map((a) => a.id), ["1"]);
});

test("Empfänger: Kunde und deaktiviertes Konto bekommen nichts", () => {
  const z = [
    abo({ id: "kunde", users: { role: "customer", is_active: true } }),
    abo({ id: "inaktiv", users: { role: "admin", is_active: false } }),
    abo({ id: "ohne", users: null }),
  ];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung"), []);
});

test("Empfänger: Besitzer darf als Liste ankommen (PostgREST-Einbettung)", () => {
  const z = [abo({ id: "1", users: [{ role: "admin", is_active: true }] })];
  assert.deepEqual(waehleEmpfaenger(z, "bestellung").map((a) => a.id), ["1"]);
});

test("Abo tot: nur 404 und 410", () => {
  assert.equal(istAboTot(404), true);
  assert.equal(istAboTot(410), true);
  assert.equal(istAboTot(500), false);
  assert.equal(istAboTot(429), false);
  assert.equal(istAboTot(undefined), false);
});

test("Gerätename aus User-Agent", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const macSafari =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
  const macChrome =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const android =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
  const winEdge =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
  assert.equal(geraeteName(iphone), "iPhone");
  assert.equal(geraeteName(macSafari), "Mac · Safari");
  assert.equal(geraeteName(macChrome), "Mac · Chrome");
  assert.equal(geraeteName(android), "Android");
  assert.equal(geraeteName(winEdge), "Windows · Edge");
  assert.equal(geraeteName(""), "Unbekanntes Gerät");
});
```

`tests/push-client.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ermittleZustand, istIosGeraet, urlBase64ToUint8Array } from "@/lib/push-client";

const basis = {
  hatPush: true,
  istIos: false,
  istInstalliert: false,
  erlaubnis: "default" as const,
  abonniert: false,
};

test("Zustand: iPhone ohne Installation geht vor „nicht unterstützt“", () => {
  // Im Safari-Tab fehlt PushManager – trotzdem ist die Antwort „installieren“.
  assert.equal(
    ermittleZustand({ ...basis, hatPush: false, istIos: true, istInstalliert: false }),
    "ios-installieren",
  );
});

test("Zustand: Browser ohne Push", () => {
  assert.equal(ermittleZustand({ ...basis, hatPush: false }), "nicht-unterstuetzt");
});

test("Zustand: installiertes iPhone, Erlaubnis offen", () => {
  assert.equal(
    ermittleZustand({ ...basis, istIos: true, istInstalliert: true }),
    "erlaubnis-offen",
  );
});

test("Zustand: im Browser blockiert", () => {
  assert.equal(ermittleZustand({ ...basis, erlaubnis: "denied" }), "blockiert");
});

test("Zustand: erlaubt und angemeldet ist aktiv", () => {
  assert.equal(ermittleZustand({ ...basis, erlaubnis: "granted", abonniert: true }), "aktiv");
});

test("Zustand: erlaubt, aber ohne Abo muss neu angemeldet werden", () => {
  assert.equal(
    ermittleZustand({ ...basis, erlaubnis: "granted", abonniert: false }),
    "erlaubnis-offen",
  );
});

test("iOS-Erkennung: iPhone, iPad mit Mac-Kennung, Mac ohne Touch", () => {
  assert.equal(istIosGeraet({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)", plattform: "iPhone", touchPunkte: 5 }), true);
  assert.equal(istIosGeraet({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", plattform: "MacIntel", touchPunkte: 5 }), true);
  assert.equal(istIosGeraet({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", plattform: "MacIntel", touchPunkte: 0 }), false);
});

test("VAPID-Schlüssel: base64url wird zu Bytes", () => {
  // 0xFB 0xFF → Standard-Base64 „+/8=“ → URL-sicher ohne Auffüllung „-_8“
  assert.deepEqual([...urlBase64ToUint8Array("-_8")], [251, 255]);
  assert.deepEqual([...urlBase64ToUint8Array("AQID")], [1, 2, 3]);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npm test`
Expected: FAIL, `Cannot find module` für `push-ziele.ts` / `push-client.ts`.

- [ ] **Step 3: `lib/push-ziele.ts` implementieren**

```ts
/**
 * Reine Entscheidungen rund um den Push-Versand – ohne Datenbank und ohne
 * Browser, damit sie testbar sind. Der Versand selbst steht in lib/push.ts.
 */

export type PushArt = "bestellung" | "neukunde";

/** Ergebnis eines Versands an ein Gerät. */
export type SendeErgebnis = "gesendet" | "entfernt" | "fehler" | "nicht-konfiguriert";

export interface Besitzer {
  role: string;
  is_active: boolean;
}

/** Zeile aus push_subscriptions, eingebettet mit dem Besitzer aus users. */
export interface AboZeile {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  bei_bestellung: boolean;
  bei_neukunde: boolean;
  /** PostgREST liefert die n:1-Einbettung als Objekt; Liste und null werden toleriert. */
  users: Besitzer | Besitzer[] | null;
}

/**
 * Empfänger einer Mitteilung: nur Admin-Konten, die aktiv sind, und nur Geräte,
 * deren Schalter für diese Art an ist. Wird ein Konto herabgestuft oder
 * deaktiviert, endet der Versand damit von selbst.
 */
export function waehleEmpfaenger<T extends AboZeile>(zeilen: T[], art: PushArt): T[] {
  return zeilen.filter((zeile) => {
    const besitzer = Array.isArray(zeile.users) ? zeile.users[0] : zeile.users;
    if (!besitzer || besitzer.role !== "admin" || !besitzer.is_active) return false;
    return art === "bestellung" ? zeile.bei_bestellung : zeile.bei_neukunde;
  });
}

/** 404/410 vom Push-Dienst: das Abo gibt es nicht mehr, es kann nie wieder zustellen. */
export function istAboTot(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/** Anzeigename eines Geräts aus dem User-Agent: „iPhone“, „Mac · Safari“ … */
export function geraeteName(userAgent: string): string {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  const system = /Macintosh/.test(ua)
    ? "Mac"
    : /Windows/.test(ua)
      ? "Windows"
      : /Linux/.test(ua)
        ? "Linux"
        : null;
  if (system && browser) return `${system} · ${browser}`;
  return system ?? browser ?? "Unbekanntes Gerät";
}
```

- [ ] **Step 4: `lib/push-client.ts` implementieren**

```ts
/**
 * Browserseite des Push: Zustand für die Einstellungsseite (rein, getestet) und
 * dünne Hilfen um Service Worker und Push-Abo. Nichts davon läuft beim Import –
 * alle Browser-Zugriffe stehen in Funktionen.
 */

export type PushZustand =
  | "nicht-unterstuetzt"
  | "ios-installieren"
  | "erlaubnis-offen"
  | "blockiert"
  | "aktiv";

/**
 * Welche der fünf Ansichten zeigt die Einstellungsseite für DIESES Gerät?
 *
 * iPhone/iPad ohne Installation geht vor „nicht unterstützt“: im Safari-Tab
 * fehlt PushManager, die richtige Auskunft ist aber „zum Home-Bildschirm
 * hinzufügen“, nicht „geht nicht“.
 */
export function ermittleZustand(e: {
  hatPush: boolean;
  istIos: boolean;
  istInstalliert: boolean;
  erlaubnis: NotificationPermission | "unbekannt";
  abonniert: boolean;
}): PushZustand {
  if (e.istIos && !e.istInstalliert) return "ios-installieren";
  if (!e.hatPush) return "nicht-unterstuetzt";
  if (e.erlaubnis === "denied") return "blockiert";
  if (e.erlaubnis === "granted" && e.abonniert) return "aktiv";
  return "erlaubnis-offen";
}

/** iPadOS meldet sich als Mac; der Berührungssensor verrät es. */
export function istIosGeraet(e: { ua: string; plattform: string; touchPunkte: number }): boolean {
  return /iPhone|iPad|iPod/.test(e.ua) || (e.plattform === "MacIntel" && e.touchPunkte > 1);
}

/** VAPID-Schlüssel (base64url) → Bytes für pushManager.subscribe(). */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const auffuellung = "=".repeat((4 - (base64.length % 4)) % 4);
  const roh = atob((base64 + auffuellung).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

export function pushUnterstuetzt(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Läuft als installierte Web-App (Home-Bildschirm / Dock)? */
export function istInstalliert(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function holeRegistrierung(): Promise<ServiceWorkerRegistration> {
  const registrierung = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return registrierung;
}

export async function aktuellesAbo(): Promise<PushSubscription | null> {
  const registrierung = await holeRegistrierung();
  return registrierung.pushManager.getSubscription();
}

/** Bestehendes Abo oder ein neues. Setzt erteilte Erlaubnis voraus. */
export async function meldeAn(): Promise<PushSubscription> {
  const schluessel = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!schluessel) throw new Error("VAPID-Schlüssel fehlt");
  const registrierung = await holeRegistrierung();
  const vorhanden = await registrierung.pushManager.getSubscription();
  if (vorhanden) return vorhanden;
  return registrierung.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(schluessel),
  });
}

/** Das, was die Server Action `abonniere` braucht. */
export function aboDaten(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
} {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent,
  };
}
```

- [ ] **Step 5: Tests und Lint**

Run: `npm test && npx eslint lib/push-ziele.ts lib/push-client.ts tests/push-ziele.test.ts tests/push-client.test.ts`
Expected: Tests grün (`fail 0`), eslint ohne Ausgabe.

- [ ] **Step 6: Commit**

```bash
git add lib/push-ziele.ts lib/push-client.ts tests/push-ziele.test.ts tests/push-client.test.ts
git commit -m "$(cat <<'EOF'
feat(push): Empfängerfilter, Gerätename und Zustandsermittlung

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Tabelle `push_subscriptions` (Migration 082)

**Files:**
- Create: `supabase/migrations/082_push_subscriptions.sql`
- Modify: `supabase/schema.sql` (Ende der Datei anhängen)

**Interfaces:**
- Produces: Tabelle `public.push_subscriptions(id, user_id, endpoint UNIQUE, p256dh, auth, geraet, bei_bestellung, bei_neukunde, zuletzt_ok, created_at)`, RLS „nur eigene Zeilen als Admin".

- [ ] **Step 1: Migration schreiben**

`supabase/migrations/082_push_subscriptions.sql`:

```sql
-- =============================================================================
-- 082 – Push-Abos der Admin-Geräte
--
-- Jedes Gerät (iPhone, Mac …), das Benachrichtigungen für neue Bestellungen und
-- neue Kunden bekommen soll, hat eine Zeile. Die Schalter liegen am Gerät:
-- Handy an, Mac aus ist möglich.
--
-- Angelegt wird über die Server Action abonniere() (Service-Key), gelesen und
-- geändert von den Admin-Einstellungen unter /account. RLS: ein Admin sieht und
-- ändert nur seine eigenen Zeilen. Der Versand läuft mit dem Service-Key und
-- filtert selbst auf role = 'admin' und is_active (lib/push-ziele.ts).
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  geraet         TEXT NOT NULL,
  bei_bestellung BOOLEAN NOT NULL DEFAULT true,
  bei_neukunde   BOOLEAN NOT NULL DEFAULT true,
  zuletzt_ok     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_eigene ON public.push_subscriptions;
CREATE POLICY push_subscriptions_eigene ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_admin())
  WITH CHECK (user_id = auth.uid() AND public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
```

- [ ] **Step 2: `schema.sql` ergänzen**

Ende von `supabase/schema.sql` lesen (`tail -20 supabase/schema.sql`) und denselben Tabellen-, Index-, RLS- und Policy-Block aus Step 1 (ohne Kopfkommentar, mit einzeiligem Verweis `-- Migration 082: Push-Abos der Admin-Geräte`) anhängen.

- [ ] **Step 3: Migrationsprüfung**

Run: `npm run check:migrations`
Expected: `Migrationen in Ordnung: 82 Dateien, letzte 082_push_subscriptions.sql`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/082_push_subscriptions.sql supabase/schema.sql
git commit -m "$(cat <<'EOF'
feat(push): Tabelle push_subscriptions (Migration 082)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Manuell einspielen (Nutzer)**

Nach `docs/betrieb.md`: Backup, dann `082_push_subscriptions.sql` im Supabase SQL Editor ausführen. Prüfung im SQL Editor:

```sql
SELECT count(*) FROM public.push_subscriptions;                       -- 0
SELECT polname FROM pg_policy WHERE polrelid = 'public.push_subscriptions'::regclass;
-- push_subscriptions_eigene
```

Erst danach funktionieren Task 6 und die Abnahme in Task 8 gegen die Datenbank. Die Tasks 4 bis 7 lassen sich ohne eingespielte Migration bauen.

---

### Task 4: Versand und Server Actions

**Files:**
- Create: `lib/push.ts`, `lib/actions/push.ts`
- Modify: `package.json`, `package-lock.json` (Abhängigkeit), `.env.local` (lokal, nicht committen), `.env.local.example`, `docs/superpowers/specs/2026-10-29-admin-push-design.md` (Subject)

**Interfaces:**
- Consumes: `bestellungText`, `neukundeText`, `testText`, `PushNachricht` (Task 1); `waehleEmpfaenger`, `istAboTot`, `AboZeile`, `PushArt`, `SendeErgebnis`, `geraeteName` (Task 2); Tabelle (Task 3); `requireAdmin` aus `@/lib/auth`; `createAdminClient`; `createClient`.
- Produces (`lib/push.ts`):
  - `sendeAnGeraet(abo: { id: string; endpoint: string; p256dh: string; auth: string }, nachricht: PushNachricht): Promise<SendeErgebnis>`
  - `sendeAnAdmins(art: PushArt, nachricht: PushNachricht): Promise<void>`
  - `meldeNeueBestellung(b: { id: string; orderNumber: string; kunde: string | null }): Promise<void>`
  - `meldeNeuenKunden(k: { id: string; firma: string | null; name: string | null; ort: string | null }): Promise<void>`
- Produces (`lib/actions/push.ts`):
  - `type PushAktion = { ok: true } | { ok: false; error: string }`
  - `type TestAktion = { ok: true; ergebnis: SendeErgebnis } | { ok: false; error: string }`
  - `abonniere(eingabe: { endpoint: string; p256dh: string; auth: string; userAgent?: string }): Promise<PushAktion>`
  - `setzeSchalter(eingabe: { id: string; feld: "bei_bestellung" | "bei_neukunde"; an: boolean }): Promise<PushAktion>`
  - `entferneGeraet(eingabe: { id: string }): Promise<PushAktion>`
  - `testeGeraet(eingabe: { id: string }): Promise<TestAktion>`

- [ ] **Step 1: Abhängigkeit installieren**

Run: `npm install web-push && npm install -D @types/web-push`
Expected: beide in `package.json` (`dependencies` bzw. `devDependencies`), `added … packages`.

- [ ] **Step 2: VAPID-Schlüssel lokal erzeugen**

Schlüssel ohne Ausgabe des privaten Teils in `.env.local` anhängen. `VAPID_SUBJECT` ist eine https-Adresse statt einer privaten Mailadresse (der Wert geht an Apple/Google als Kontakt des Absenders; erlaubt sind `mailto:` und `https:`):

```bash
node -e '
const w = require("web-push");
const k = w.generateVAPIDKeys();
require("fs").appendFileSync(".env.local",
`\n# Web-Push für Admin-Benachrichtigungen\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=https://www.lider-berlin.de\n`);
console.log("VAPID-Schlüssel in .env.local eingetragen");
'
git check-ignore .env.local
```
Expected: `VAPID-Schlüssel in .env.local eingetragen`, dann `.env.local` (Datei ist ignoriert).

- [ ] **Step 3: `.env.local.example` ergänzen**

Am Ende anhängen:

```
# Web-Push – Benachrichtigungen für Admin-Konten (neue Bestellung, neuer Kunde).
# Schlüsselpaar erzeugen: node -e 'console.log(require("web-push").generateVAPIDKeys())'
# Der öffentliche Teil landet im Browser (NEXT_PUBLIC_), der private nie.
# VAPID_SUBJECT: https-Adresse des Shops oder mailto:-Adresse; geht als Kontakt
# an Apple/Google. Ohne die drei Werte wird der Versand übersprungen und geloggt.
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

- [ ] **Step 4: Spec an den Subject-Wert angleichen**

In `docs/superpowers/specs/2026-10-29-admin-push-design.md` den Satz zu `VAPID_SUBJECT` (`mailto:` mit der Kontaktadresse aus den Firmendaten) ersetzen durch: `VAPID_SUBJECT` (https-Adresse des Shops, `https://www.lider-berlin.de`; eine private Mailadresse geht nicht an die Push-Dienste von Apple/Google).

- [ ] **Step 5: `lib/push.ts` schreiben**

```ts
import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  istAboTot,
  waehleEmpfaenger,
  type AboZeile,
  type PushArt,
  type SendeErgebnis,
} from "@/lib/push-ziele";
import {
  bestellungText,
  neukundeText,
  type PushNachricht,
} from "@/lib/push-text";

/**
 * Push-Versand an die Geräte der Admin-Konten.
 *
 * Wie lib/email.ts: Fehler werden geloggt, nie geworfen. Eine bereits
 * abgeschlossene Bestellung oder Registrierung darf an einer Mitteilung nie
 * scheitern. Fehlen die VAPID-Schlüssel, wird übersprungen.
 */

let vapidBereit: boolean | null = null;

function konfiguriert(): boolean {
  if (vapidBereit !== null) return vapidBereit;
  const oeffentlich = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privat = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!oeffentlich || !privat || !subject) {
    console.warn("[push] VAPID-Schlüssel fehlen – Versand übersprungen");
    vapidBereit = false;
    return false;
  }
  webpush.setVapidDetails(subject, oeffentlich, privat);
  vapidBereit = true;
  return true;
}

type Ziel = Pick<AboZeile, "id" | "endpoint" | "p256dh" | "auth">;

/** Ein Gerät. Entfernt das Abo, wenn der Push-Dienst es als erloschen meldet. */
export async function sendeAnGeraet(
  abo: Ziel,
  nachricht: PushNachricht,
): Promise<SendeErgebnis> {
  if (!konfiguriert()) return "nicht-konfiguriert";
  const admin = createAdminClient();
  try {
    await webpush.sendNotification(
      { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
      JSON.stringify(nachricht),
      { TTL: 24 * 60 * 60, urgency: "high", timeout: 10_000 },
    );
    await admin
      .from("push_subscriptions")
      .update({ zuletzt_ok: new Date().toISOString() })
      .eq("id", abo.id);
    return "gesendet";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (istAboTot(status)) {
      await admin.from("push_subscriptions").delete().eq("id", abo.id);
      return "entfernt";
    }
    console.error("[push] Versand fehlgeschlagen:", status ?? "", (err as Error).message);
    return "fehler";
  }
}

/** Alle passenden Geräte aller aktiven Admins. */
export async function sendeAnAdmins(art: PushArt, nachricht: PushNachricht): Promise<void> {
  try {
    if (!konfiguriert()) return;
    const { data, error } = await createAdminClient()
      .from("push_subscriptions")
      .select(
        "id, endpoint, p256dh, auth, bei_bestellung, bei_neukunde, users!inner(role, is_active)",
      );
    if (error) {
      console.error("[push] Abos konnten nicht gelesen werden:", error.message);
      return;
    }
    const empfaenger = waehleEmpfaenger((data ?? []) as unknown as AboZeile[], art);
    await Promise.allSettled(empfaenger.map((abo) => sendeAnGeraet(abo, nachricht)));
  } catch (err) {
    console.error("[push] sendeAnAdmins:", err);
  }
}

/** Nach erfolgreichem create_order aufrufen (über after()). */
export async function meldeNeueBestellung(b: {
  id: string;
  orderNumber: string;
  kunde: string | null;
}): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("orders")
      .select("total_amount")
      .eq("id", b.id)
      .maybeSingle();
    await sendeAnAdmins(
      "bestellung",
      bestellungText({
        id: b.id,
        orderNumber: b.orderNumber,
        kunde: b.kunde,
        gesamt: data?.total_amount ?? null,
      }),
    );
  } catch (err) {
    console.error("[push] meldeNeueBestellung:", err);
  }
}

/** Nach erfolgreich angelegtem Konto aufrufen (über after()). */
export async function meldeNeuenKunden(k: {
  id: string;
  firma: string | null;
  name: string | null;
  ort: string | null;
}): Promise<void> {
  try {
    await sendeAnAdmins("neukunde", neukundeText(k));
  } catch (err) {
    console.error("[push] meldeNeuenKunden:", err);
  }
}
```

- [ ] **Step 6: `lib/actions/push.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { sendeAnGeraet } from "@/lib/push";
import { geraeteName, type SendeErgebnis } from "@/lib/push-ziele";
import { testText } from "@/lib/push-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PushAktion = { ok: true } | { ok: false; error: string };
export type TestAktion = { ok: true; ergebnis: SendeErgebnis } | { ok: false; error: string };

const FEHLER = "Das hat nicht geklappt. Bitte erneut versuchen.";

const abonnementSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine((u) => u.startsWith("https://"), "Push-Adresse muss https sein"),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(200),
  userAgent: z.string().max(500).default(""),
});

/**
 * Gerät anmelden oder erneuern. Upsert nach endpoint: Schlüssel, Besitzer und
 * Gerätename werden aktualisiert, die Schalter bleiben (sie stehen nicht im
 * Payload). Geschrieben mit dem Service-Key, weil ein Endpoint, der zuvor einem
 * anderen Admin gehörte, unter dessen RLS nicht übernommen werden könnte.
 */
export async function abonniere(
  eingabe: z.input<typeof abonnementSchema>,
): Promise<PushAktion> {
  const admin = await requireAdmin();
  const parsed = abonnementSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: "Das Gerät konnte nicht angemeldet werden." };

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: admin.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        geraet: geraeteName(parsed.data.userAgent),
      },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("[push] abonniere:", error.message);
    return { ok: false, error: "Das Gerät konnte nicht angemeldet werden." };
  }
  return { ok: true };
}

const schalterSchema = z.object({
  id: z.string().uuid(),
  feld: z.enum(["bei_bestellung", "bei_neukunde"]),
  an: z.boolean(),
});

/** RLS begrenzt auf eigene Zeilen; trifft nichts zu, war es nicht das eigene Gerät. */
export async function setzeSchalter(
  eingabe: z.input<typeof schalterSchema>,
): Promise<PushAktion> {
  await requireAdmin();
  const parsed = schalterSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: FEHLER };

  const { data, error } = await (await createClient())
    .from("push_subscriptions")
    .update({ [parsed.data.feld]: parsed.data.an })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[push] setzeSchalter:", error.message);
    return { ok: false, error: FEHLER };
  }
  return { ok: true };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function entferneGeraet(eingabe: z.input<typeof idSchema>): Promise<PushAktion> {
  await requireAdmin();
  const parsed = idSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: FEHLER };

  const { error } = await (await createClient())
    .from("push_subscriptions")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    console.error("[push] entferneGeraet:", error.message);
    return { ok: false, error: FEHLER };
  }
  return { ok: true };
}

/** Sendet sofort eine Probe an ein eigenes Gerät. */
export async function testeGeraet(eingabe: z.input<typeof idSchema>): Promise<TestAktion> {
  await requireAdmin();
  const parsed = idSchema.safeParse(eingabe);
  if (!parsed.success) return { ok: false, error: FEHLER };

  const { data, error } = await (await createClient())
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Dieses Gerät wurde nicht gefunden." };

  return { ok: true, ergebnis: await sendeAnGeraet(data, testText()) };
}
```

- [ ] **Step 7: Lint und Tests**

Run: `npx eslint lib/push.ts lib/actions/push.ts && npm test`
Expected: eslint ohne Ausgabe, Tests grün.

Die Typprüfung läuft gesammelt im `npm run build` in Task 8; fällt hier ein Typfehler auf (z. B. `web-push`-Optionen), jetzt beheben.

- [ ] **Step 8: Commit**

`.env.local` ist ignoriert und wird nicht hinzugefügt.

```bash
git add package.json package-lock.json .env.local.example lib/push.ts lib/actions/push.ts docs/superpowers/specs/2026-10-29-admin-push-design.md
git commit -m "$(cat <<'EOF'
feat(push): Versand per web-push und Server Actions für Geräte

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Auslöser in `createOrder` und `signUp`

**Files:**
- Modify: `lib/actions/orders.ts` (Import-Block; nach `revalidatePath("/shop")`, Zeile ~196)
- Modify: `lib/actions/auth.ts` (Import-Block; vor dem `return { success: … }` von `signUp`, Zeile ~275)

**Interfaces:**
- Consumes: `meldeNeueBestellung`, `meldeNeuenKunden` (Task 4); `after` aus `next/server`.

- [ ] **Step 1: `createOrder` – Import und Aufruf**

In `lib/actions/orders.ts` unter die vorhandenen `next/cache`-Importe:

```ts
import { after } from "next/server";
```
und bei den `@/lib/…`-Importen:

```ts
import { meldeNeueBestellung } from "@/lib/push";
```

Nach `const created = data as { id: string; order_number: string };` (vor dem `try { await generateAndSendOrderInvoice … }`) einfügen:

```ts
  /*
   * Mitteilung an die Admin-Geräte. Nur für Kundenbestellungen: bestellt der
   * Admin selbst über den Shop, weiß er es. after() lässt die Antwort an den
   * Kunden nicht auf den Push warten; meldeNeueBestellung wirft nie.
   */
  if (user.role === "customer") {
    after(() =>
      meldeNeueBestellung({
        id: created.id,
        orderNumber: created.order_number,
        kunde: user.company_name || user.full_name || user.email,
      }),
    );
  }
```

- [ ] **Step 2: `signUp` – Import und Aufruf**

In `lib/actions/auth.ts` zu den Importen:

```ts
import { after } from "next/server";
import { meldeNeuenKunden } from "@/lib/push";
```

Direkt vor dem abschließenden `return { success: "Konto angelegt. Bitte bestätigen …" };` von `signUp` (nach dem Newsletter-Block) einfügen:

```ts
  // Mitteilung an die Admin-Geräte: ein neues Konto hat sich registriert (noch
  // unbestätigt – aktiv wird es erst über den Link der Bestätigungsmail).
  const neueId = data.user.id;
  after(() =>
    meldeNeuenKunden({
      id: neueId,
      firma: company_name,
      name: full_name,
      ort: parsed.data.billing_city,
    }),
  );
```

Der Honeypot-Zweig am Anfang von `signUp` und der Admin-Weg `lib/actions/admin-customers.ts` bleiben unberührt: Bots und vom Admin selbst angelegte Konten melden nichts.

- [ ] **Step 3: Lint**

Run: `npx eslint lib/actions/orders.ts lib/actions/auth.ts`
Expected: keine Ausgabe.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/orders.ts lib/actions/auth.ts
git commit -m "$(cat <<'EOF'
feat(push): Mitteilung bei Kundenbestellung und Registrierung

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Service Worker, Manifest, Symbole, Proxy

**Files:**
- Create: `public/sw.js`, `app/manifest.ts`, `scripts/push-icons.mjs`, `app/apple-icon.png` (erzeugt), `public/logo/logo-mark-192.png` (erzeugt)
- Modify: `proxy.ts` (`MAINTENANCE_EXEMPT_PREFIXES`), `next.config.ts` (`headers()`), `app/layout.tsx` (`metadata`)

**Interfaces:**
- Produces: `/sw.js` (Push-Handler), `/manifest.webmanifest`, `<link rel="apple-touch-icon">`.

- [ ] **Step 1: `public/sw.js`**

```js
/*
 * Service Worker für die Admin-Benachrichtigungen. Er macht nur zwei Dinge:
 * Push anzeigen und beim Antippen die Zielseite öffnen. Kein Caching, kein
 * fetch-Handler – der Shop lädt ganz normal.
 *
 * iOS entzieht ein Push-Abo, wenn ein Push nicht als sichtbare Mitteilung
 * endet. Darum wird IMMER eine angezeigt, auch bei leerem oder defektem Inhalt.
 *
 * Das Symbol steht fest hier (ein Worker kann lib/logo.ts nicht nutzen):
 * public/logo/logo-mark.png, das Wappen.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch {
    daten = {};
  }

  event.waitUntil(
    self.registration.showNotification(daten.title || "LIDER", {
      body: daten.body || "Neue Meldung bei LIDER",
      tag: daten.tag || "lider",
      icon: "/logo/logo-mark.png",
      data: { url: daten.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Nur Ziele auf der eigenen Domain; alles andere fällt auf /admin zurück.
  let ziel = new URL("/admin", self.location.origin);
  try {
    const gewuenscht = new URL(event.notification.data?.url || "/admin", self.location.origin);
    if (gewuenscht.origin === self.location.origin) ziel = gewuenscht;
  } catch {
    /* bleibt bei /admin */
  }

  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const f of fenster) {
        if (new URL(f.url).origin === self.location.origin && "focus" in f) {
          await f.focus();
          if ("navigate" in f) {
            try {
              await f.navigate(ziel.href);
            } catch {
              /* Fenster bleibt, wo es ist */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(ziel.href);
    })(),
  );
});
```

- [ ] **Step 2: Symbole erzeugen**

`logo-mark.png` hat Transparenz; iOS füllt sie beim Home-Bildschirm-Symbol schwarz. Deshalb auf Weiß legen. `sharp` liegt bereits in `node_modules` (wird von Skripten wie `bilder-markenspielzeug.mjs` genutzt).

`scripts/push-icons.mjs`:

```js
/**
 * Erzeugt die Symbole für die Admin-Web-App aus dem Wappen:
 *   app/apple-icon.png            180 × 180, weißer Grund (iOS Home-Bildschirm)
 *   public/logo/logo-mark-192.png 192 × 192, weißer Grund (Manifest)
 *
 *   node scripts/push-icons.mjs
 */
import sharp from "sharp";

const QUELLE = "public/logo/logo-mark.png";

async function symbol(groesse, ziel) {
  await sharp(QUELLE)
    .resize(groesse, groesse, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(ziel);
  console.log("geschrieben:", ziel);
}

await symbol(180, "app/apple-icon.png");
await symbol(192, "public/logo/logo-mark-192.png");
```

Run: `node scripts/push-icons.mjs && file app/apple-icon.png public/logo/logo-mark-192.png`
Expected: zwei Zeilen `geschrieben: …`; `file` meldet `PNG image data, 180 x 180` und `192 x 192`, `RGB` ohne Alpha.

- [ ] **Step 3: `app/manifest.ts`**

```ts
import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest. Es macht „Zum Home-Bildschirm“ auf dem iPhone zur eigenen
 * App – Voraussetzung dafür, dass iOS Web-Push überhaupt zustellt. Gestartet
 * wird im Admin; die Markenfarbe `--brand` (#284078) steht aus app/globals.css
 * hier fest, weil ein Manifest keine CSS-Variablen kennt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIDER Admin",
    short_name: "LIDER",
    description: "Verwaltung und Benachrichtigungen des LIDER-Shops",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#284078",
    icons: [
      { src: "/logo/logo-mark-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo/logo-mark.png", sizes: "480x480", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 4: `proxy.ts` – Wartungsausnahmen**

In `MAINTENANCE_EXEMPT_PREFIXES` vor dem schließenden `];` ergänzen:

```ts
  // Service Worker und Manifest der Admin-Web-App: dürfen nie auf /wartung
  // umgeleitet werden, sonst scheitert die Registrierung des Workers.
  "/sw.js",
  "/manifest.webmanifest",
```

Vorher prüfen, dass die Ausnahmeliste per `startsWith` ausgewertet wird: `grep -n "MAINTENANCE_EXEMPT_PREFIXES" proxy.ts`. Ist es ein exakter Vergleich, passt `"/sw.js"` ebenfalls.

- [ ] **Step 5: `next.config.ts` – Header für den Worker**

In der Liste von `headers()` einen zweiten Eintrag nach dem vorhandenen `/:path*`-Block:

```ts
      {
        // Der Worker darf nie aus dem Cache kommen: Änderungen an sw.js müssen
        // beim nächsten Besuch greifen, sonst läuft ein alter Handler weiter.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
```

- [ ] **Step 6: `app/layout.tsx` – iOS-Metadaten**

Im `metadata`-Objekt nach `description: BESCHREIBUNG,` ergänzen:

```ts
  // Home-Bildschirm-App auf dem iPhone (Admin-Benachrichtigungen, siehe
  // app/manifest.ts). Das Symbol liefert app/apple-icon.png.
  appleWebApp: { capable: true, title: "LIDER Admin", statusBarStyle: "default" },
```

- [ ] **Step 7: Prüfen**

Run: `npx eslint proxy.ts next.config.ts app/layout.tsx app/manifest.ts && npm run dev`
(`npm run dev` im Hintergrund starten, `curl` dann beenden.)

```bash
curl -sI http://localhost:3000/sw.js | grep -i -E "^HTTP|cache-control|content-type"
curl -s http://localhost:3000/manifest.webmanifest | head -c 300
curl -s http://localhost:3000/ | grep -o -E '<link rel="apple-touch-icon"[^>]*>'
```
Expected: `HTTP/1.1 200`, `cache-control: no-cache, no-store, must-revalidate`, `content-type: application/javascript…`; Manifest-JSON mit `"name":"LIDER Admin"`; ein `apple-touch-icon`-Link. Dev-Server danach beenden.

- [ ] **Step 8: Commit**

```bash
git add public/sw.js app/manifest.ts scripts/push-icons.mjs app/apple-icon.png public/logo/logo-mark-192.png proxy.ts next.config.ts app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(push): Service Worker, Web-App-Manifest und Symbole

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Oberfläche – Einstellungen, stiller Abgleich, Bestellzähler

**Files:**
- Create: `components/admin/push-einstellungen.tsx`, `components/admin/push-sync.tsx`
- Modify: `app/account/page.tsx`, `app/admin/layout.tsx`, `components/admin/admin-tabs.tsx`

**Interfaces:**
- Consumes: `abonniere`, `setzeSchalter`, `entferneGeraet`, `testeGeraet` (Task 4); `ermittleZustand`, `istIosGeraet`, `pushUnterstuetzt`, `istInstalliert`, `aktuellesAbo`, `meldeAn`, `aboDaten`, `PushZustand` (Task 2); `formatDateTime` aus `@/lib/format`.
- Produces:
  - `interface PushGeraet { id: string; endpoint: string; geraet: string; bei_bestellung: boolean; bei_neukunde: boolean; zuletzt_ok: string | null }`
  - `<PushEinstellungen geraete={PushGeraet[]} />`, `<PushSync />`
  - `AdminTab.badge?: number`

- [ ] **Step 1: `components/admin/push-sync.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { abonniere } from "@/lib/actions/push";
import { aboDaten, meldeAn, pushUnterstuetzt } from "@/lib/push-client";

/**
 * Hält das Push-Abo dieses Geräts frisch. Ist die Erlaubnis erteilt, wird bei
 * jedem Aufruf des Admins das Abo geprüft, bei Bedarf neu angelegt und dem
 * Server gemeldet. Fängt abgelaufene oder vom System entzogene Abos ab, ohne
 * dass jemand etwas tun muss. Zeigt nichts an und fragt nie nach Erlaubnis –
 * das geschieht ausschließlich auf Klick in den Einstellungen.
 */
export function PushSync() {
  useEffect(() => {
    if (!pushUnterstuetzt() || Notification.permission !== "granted") return;
    (async () => {
      const abo = await meldeAn();
      await abonniere(aboDaten(abo));
    })().catch((err) => console.warn("[push] Abgleich fehlgeschlagen:", err));
  }, []);

  return null;
}
```

- [ ] **Step 2: `components/admin/push-einstellungen.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { abonniere, entferneGeraet, setzeSchalter, testeGeraet } from "@/lib/actions/push";
import { formatDateTime } from "@/lib/format";
import {
  aboDaten,
  aktuellesAbo,
  ermittleZustand,
  istIosGeraet,
  istInstalliert,
  meldeAn,
  pushUnterstuetzt,
  type PushZustand,
} from "@/lib/push-client";

export interface PushGeraet {
  id: string;
  endpoint: string;
  geraet: string;
  bei_bestellung: boolean;
  bei_neukunde: boolean;
  zuletzt_ok: string | null;
}

type Feld = "bei_bestellung" | "bei_neukunde";

/**
 * Benachrichtigungen in /account, nur für Admins. Oben der Zustand DIESES
 * Geräts (fünf Ansichten), darunter alle Geräte mit ihren Schaltern.
 */
export function PushEinstellungen({ geraete }: { geraete: PushGeraet[] }) {
  const router = useRouter();
  const [liste, setListe] = useState(geraete);
  const [zustand, setZustand] = useState<PushZustand | null>(null);
  const [dieses, setDieses] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);

  // Server-Stand übernehmen, wenn router.refresh() neu geladen hat.
  useEffect(() => setListe(geraete), [geraete]);

  useEffect(() => {
    (async () => {
      const hatPush = pushUnterstuetzt();
      const ios = istIosGeraet({
        ua: navigator.userAgent,
        plattform: navigator.platform,
        touchPunkte: navigator.maxTouchPoints,
      });
      let endpoint: string | null = null;
      if (hatPush && Notification.permission === "granted") {
        try {
          endpoint = (await aktuellesAbo())?.endpoint ?? null;
        } catch {
          endpoint = null;
        }
      }
      setDieses(endpoint);
      setZustand(
        ermittleZustand({
          hatPush,
          istIos: ios,
          istInstalliert: istInstalliert(),
          erlaubnis: hatPush ? Notification.permission : "unbekannt",
          abonniert: endpoint !== null,
        }),
      );
    })();
  }, []);

  async function aktivieren() {
    setBeschaeftigt("aktivieren");
    try {
      // Muss direkt aus dem Klick heraus gefragt werden, sonst verweigert iOS.
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== "granted") {
        setZustand(erlaubnis === "denied" ? "blockiert" : "erlaubnis-offen");
        return;
      }
      const abo = await meldeAn();
      const antwort = await abonniere(aboDaten(abo));
      if (!antwort.ok) {
        toast.error(antwort.error);
        return;
      }
      setDieses(abo.endpoint);
      setZustand("aktiv");
      toast.success("Benachrichtigungen sind aktiv.");
      router.refresh();
    } catch (err) {
      console.error("[push] aktivieren:", err);
      toast.error("Die Benachrichtigungen konnten nicht aktiviert werden.");
    } finally {
      setBeschaeftigt(null);
    }
  }

  async function schalten(g: PushGeraet, feld: Feld, an: boolean) {
    setListe((alt) => alt.map((x) => (x.id === g.id ? { ...x, [feld]: an } : x)));
    const antwort = await setzeSchalter({ id: g.id, feld, an });
    if (!antwort.ok) {
      setListe((alt) => alt.map((x) => (x.id === g.id ? { ...x, [feld]: !an } : x)));
      toast.error(antwort.error);
    }
  }

  async function testen(g: PushGeraet) {
    setBeschaeftigt(g.id);
    const antwort = await testeGeraet({ id: g.id });
    setBeschaeftigt(null);
    if (!antwort.ok) {
      toast.error(antwort.error);
      return;
    }
    if (antwort.ergebnis === "gesendet") toast.success("Test gesendet – er sollte gleich erscheinen.");
    else if (antwort.ergebnis === "entfernt") {
      toast.error("Dieses Gerät war nicht mehr erreichbar und wurde entfernt.");
      router.refresh();
    } else if (antwort.ergebnis === "nicht-konfiguriert") {
      toast.error("Der Versand ist auf dem Server noch nicht eingerichtet.");
    } else toast.error("Der Test konnte nicht zugestellt werden.");
  }

  async function entfernen(g: PushGeraet) {
    setBeschaeftigt(g.id);
    const antwort = await entferneGeraet({ id: g.id });
    if (!antwort.ok) {
      setBeschaeftigt(null);
      toast.error(antwort.error);
      return;
    }
    if (g.endpoint === dieses) {
      try {
        await (await aktuellesAbo())?.unsubscribe();
      } catch {
        /* Der Server-Eintrag ist weg; mehr ist nicht nötig. */
      }
      setDieses(null);
      setZustand("erlaubnis-offen");
    }
    setBeschaeftigt(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Hier legen Sie fest, auf welchen Geräten eine Mitteilung erscheint, wenn eine
        Bestellung eingeht oder sich ein neuer Kunde registriert.
      </p>

      {zustand === null ? (
        <p className="text-sm text-muted-foreground">Gerät wird geprüft …</p>
      ) : zustand === "nicht-unterstuetzt" ? (
        <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
          Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone geht es ab
          iOS 16.4 als Home-Bildschirm-App, auf dem Mac in Safari oder Chrome.
        </p>
      ) : zustand === "ios-installieren" ? (
        <div className="rounded-md border border-gold/50 bg-gold-soft px-4 py-3 text-sm">
          <p className="font-medium">Auf dem iPhone zuerst als App installieren</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In Safari unten auf „Teilen“ tippen.</li>
            <li>„Zum Home-Bildschirm“ wählen und bestätigen.</li>
            <li>Die App „LIDER Admin“ vom Home-Bildschirm öffnen und hier zurückkehren.</li>
          </ol>
        </div>
      ) : zustand === "blockiert" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Benachrichtigungen sind für diese Seite blockiert. Erlauben Sie sie in den
          Einstellungen des Browsers bzw. in den iPhone-Einstellungen unter
          „Mitteilungen“, und laden Sie die Seite neu.
        </p>
      ) : zustand === "erlaubnis-offen" ? (
        <Button type="button" onClick={aktivieren} disabled={beschaeftigt === "aktivieren"}>
          {beschaeftigt === "aktivieren" ? "Wird aktiviert …" : "Benachrichtigungen auf diesem Gerät aktivieren"}
        </Button>
      ) : (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Dieses Gerät ist angemeldet.
        </p>
      )}

      {liste.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {liste.map((g) => (
            <li key={g.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-medium">{g.geraet}</p>
                {g.endpoint === dieses ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">dieses Gerät</span>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {g.zuletzt_ok
                    ? `Zuletzt erreicht ${formatDateTime(g.zuletzt_ok)}`
                    : "Noch keine Mitteilung zugestellt"}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${g.id}-bestellung`}
                    checked={g.bei_bestellung}
                    onCheckedChange={(v) => schalten(g, "bei_bestellung", v === true)}
                  />
                  <Label htmlFor={`${g.id}-bestellung`} className="font-normal">
                    Neue Bestellung
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${g.id}-neukunde`}
                    checked={g.bei_neukunde}
                    onCheckedChange={(v) => schalten(g, "bei_neukunde", v === true)}
                  />
                  <Label htmlFor={`${g.id}-neukunde`} className="font-normal">
                    Neuer Kunde
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={beschaeftigt === g.id} onClick={() => testen(g)}>
                  Test senden
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={beschaeftigt === g.id} onClick={() => entfernen(g)}>
                  Entfernen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

Vor dem Schreiben prüfen: `grep -n "size" components/ui/button.tsx | head` (Variante `sm` vorhanden?) und `grep -n "onCheckedChange" components/ui/checkbox.tsx` bzw. Radix-Verwendung; bei Abweichung die Props an die vorhandene Komponente anpassen.

- [ ] **Step 3: `/account` – Abschnitt einbauen**

In `app/account/page.tsx`:

Importe: `Bell` zu den `lucide-react`-Importen hinzufügen und
```tsx
import { PushEinstellungen, type PushGeraet } from "@/components/admin/push-einstellungen";
```

Nach dem Newsletter-Query (vor `const [angebot, code] = …`) einfügen:

```tsx
  // Nur Admins: Geräte für Benachrichtigungen (Migration 082). Fehlt die
  // Tabelle noch, erscheint stattdessen ein Hinweis.
  let geraete: PushGeraet[] | null = null;
  if (user.role === "admin") {
    const { data, error } = await (await createClient())
      .from("push_subscriptions")
      .select("id, endpoint, geraet, bei_bestellung, bei_neukunde, zuletzt_ok")
      .order("created_at");
    if (error) console.error("[push] Geräteliste:", error.message);
    else geraete = data as PushGeraet[];
  }
```

Zwischen dem Newsletter-Abschnitt (`) : null}`) und dem Abschnitt „Passwort“ einfügen:

```tsx
      {user.role === "admin" ? (
        <section className="mt-6 rounded-md border border-border p-6">
          <div className="flex items-center gap-3">
            <span className="tag-4 flex size-8 items-center justify-center rounded-md">
              <Bell className="size-4" aria-hidden />
            </span>
            <h2 className="font-medium">Benachrichtigungen</h2>
          </div>
          <div className="mt-4">
            {geraete ? (
              <PushEinstellungen geraete={geraete} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Benachrichtigungen sind noch nicht eingerichtet: Die Migration{" "}
                <code>082_push_subscriptions.sql</code> fehlt in der Datenbank.
              </p>
            )}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 4: Admin-Layout – `PushSync` und Bestellzähler**

`components/admin/admin-tabs.tsx`: in `AdminTab` ergänzen

```ts
  /** Zahl neben dem Namen, z. B. ungesehene Bestellungen; 0/leer = keine */
  badge?: number;
```
und im `<Link>` nach `{tab.label}`:

```tsx
            {tab.badge ? (
              <span className="ml-0.5 rounded-full bg-signal px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-signal-foreground tabular">
                {tab.badge}
                <span className="sr-only"> neu eingegangen</span>
              </span>
            ) : null}
```

`app/admin/layout.tsx`: Importe

```tsx
import { PushSync } from "@/components/admin/push-sync";
import { createClient } from "@/lib/supabase/server";
```

Vor `export default` die Hilfsfunktion:

```tsx
/**
 * Bestellungen im Anfangsstatus „Eingegangen“ (create_order setzt 'submitted').
 * Zweite Absicherung neben dem Push: bleibt eine Mitteilung einmal aus, steht
 * die Zahl beim nächsten Öffnen der Verwaltung am Reiter „Bestellungen“.
 */
async function zaehleNeueBestellungen(): Promise<number> {
  const { count, error } = await (await createClient())
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");
  if (error) {
    console.error("[admin] Zähler neue Bestellungen:", error.message);
    return 0;
  }
  return count ?? 0;
}
```

Im Layout:

```tsx
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const neu = await zaehleNeueBestellungen();
  const tabs = ADMIN_TABS.map((tab) =>
    tab.href === "/admin/orders" && neu > 0 ? { ...tab, badge: neu } : tab,
  );

  return (
    <div className="mx-auto max-w-[120rem] px-4 py-8 sm:px-6 lg:px-8">
      <PushSync />
      <AdminTabs tabs={tabs} />
      {children}
    </div>
  );
}
```
(Die vorhandenen Kommentare am `<div>` bleiben erhalten.)

- [ ] **Step 5: Lint**

Run: `npx eslint components/admin/push-einstellungen.tsx components/admin/push-sync.tsx components/admin/admin-tabs.tsx app/admin/layout.tsx app/account/page.tsx`
Expected: keine Ausgabe. Fehler wegen `react-hooks/set-state-in-effect` o. Ä.: die Muster `useEffect(() => setListe(geraete), [geraete])` bzw. Zustand setzen im Effekt durch die im Repo übliche Variante ersetzen (`grep -rn "useEffect" components | head`), Verhalten beibehalten.

- [ ] **Step 6: Commit**

```bash
git add components/admin/push-einstellungen.tsx components/admin/push-sync.tsx components/admin/admin-tabs.tsx app/admin/layout.tsx app/account/page.tsx
git commit -m "$(cat <<'EOF'
feat(push): Einstellungen je Gerät, stiller Abgleich, Bestellzähler

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Dokumentation, Gesamtprüfung, Abnahme

**Files:**
- Modify: `CLAUDE.md` (neuer kurzer Abschnitt), `docs/betrieb.md` (Abschnitt Push), `docs/todo.md` (Migration 082 und Env-Vars)

- [ ] **Step 1: `CLAUDE.md` – Abschnitt „Admin-Push“**

Vor dem Abschnitt `## 📚 Vertiefung in docs/` einfügen:

```markdown
---

## 🔔 Admin-Push

Web-Push für Admin-Konten bei neuer Kundenbestellung und neuer Registrierung.
Spec: `docs/superpowers/specs/2026-10-29-admin-push-design.md`.

- **Versand nach dem Buchen, nie davor:** `createOrder` und `signUp` rufen
  `meldeNeueBestellung` / `meldeNeuenKunden` (`lib/push.ts`) über `after()`.
  Der Versand wirft nie; eine Bestellung scheitert nie an einer Mitteilung.
- **Nur Admin-Konten:** `waehleEmpfaenger()` (`lib/push-ziele.ts`) filtert auf
  `role = 'admin'`, `is_active` und den Schalter des Geräts. Admin-eigene
  Bestellungen (Telefon, Kasse, Rechnung aus Katalog) lösen nichts aus.
- **Schalter je Gerät** in `push_subscriptions` (Migration 082), bedient unter
  `/account`. Texte in `lib/push-text.ts`: nie Einkaufspreis, nie Positionen.
- **Service Worker** `public/sw.js` zeigt jeden Push immer an (iOS entzieht
  sonst das Abo). iPhone braucht die Web-App auf dem Home-Bildschirm
  (`app/manifest.ts`).
- Schlüssel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`;
  Einrichtung in `docs/betrieb.md`.
```

- [ ] **Step 2: `docs/betrieb.md` – Abschnitt am Ende**

```markdown
## Admin-Benachrichtigungen (Web-Push)

**Einmalig einrichten**

1. Migration `082_push_subscriptions.sql` einspielen (siehe oben).
2. Schlüsselpaar erzeugen: `node -e 'console.log(require("web-push").generateVAPIDKeys())'`.
3. In Vercel (Production **und** Preview) eintragen: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (= `https://www.lider-berlin.de`). Danach neu
   deployen, weil der öffentliche Schlüssel beim Build in den Browsercode eingeht.
   Lokal stehen sie in `.env.local`. Das Paar nicht tauschen, solange Geräte
   angemeldet sind – alte Abos funktionieren mit einem neuen Paar nicht mehr.

**Gerät anmelden**

- *iPhone (iOS 16.4+):* in Safari die Shop-Adresse öffnen, anmelden, „Teilen →
  Zum Home-Bildschirm“, die App „LIDER Admin“ **vom Home-Bildschirm** öffnen,
  `/account` → Benachrichtigungen → „aktivieren“, Erlaubnis bestätigen. Dann
  „Test senden“.
- *Mac:* in Safari oder Chrome `/account` öffnen, aktivieren, Erlaubnis
  bestätigen, „Test senden“. In den Systemeinstellungen unter „Mitteilungen“
  muss der Browser Mitteilungen anzeigen dürfen und der Fokus darf sie nicht
  stummschalten.

**Wenn etwas ausbleibt**

- Reiter „Bestellungen“ in der Verwaltung zeigt die Zahl der noch nicht
  bearbeiteten Bestellungen (Status „Eingegangen“) – auch ohne Push.
- `/account` → Benachrichtigungen: „Zuletzt erreicht“ je Gerät; „Test senden“
  meldet, ob das Gerät noch erreichbar ist (sonst wird es entfernt, dann neu
  aktivieren).
- Vercel-Logs nach `[push]` durchsuchen. `VAPID-Schlüssel fehlen` heißt:
  Variablen nicht gesetzt oder nicht neu deployt.
- iPhone: Fokus-/Nicht-stören-Modus, ausgeschaltete Mitteilungen für die App in
  den iPhone-Einstellungen, oder die App wurde vom Home-Bildschirm gelöscht.
```

- [ ] **Step 3: `docs/todo.md` ergänzen**

Unter „Migrationen“ die Zeile `- [ ] \`082_push_subscriptions.sql\` (Admin-Push)` anhängen; unter „Vercel – Environment Variables“ die Zeile `- [ ] \`NEXT_PUBLIC_VAPID_PUBLIC_KEY\`, \`VAPID_PRIVATE_KEY\`, \`VAPID_SUBJECT\` (Admin-Push, siehe docs/betrieb.md)`.

- [ ] **Step 4: Gesamtprüfung**

Run: `npm test && npm run lint && npm run check:migrations && npm run build`
Expected: Tests `fail 0`; Lint ohne Fehler; `Migrationen in Ordnung: 82 Dateien, letzte 082_push_subscriptions.sql`; Build erfolgreich, `/manifest.webmanifest` in der Routenliste. Typfehler (z. B. aus `lib/push.ts`, `lib/actions/push.ts`, den Komponenten) jetzt beheben und neu bauen.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/betrieb.md docs/todo.md
git commit -m "$(cat <<'EOF'
docs(push): Betrieb, Einrichtung und Fehlersuche für Admin-Push

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Abnahme durch den Nutzer** (kann nicht automatisiert laufen)

Voraussetzung: Migration 082 in der Datenbank, VAPID-Variablen lokal oder in Vercel gesetzt und deployt.

1. Mac: `/account` → aktivieren → „Test senden“ → Mitteilung erscheint, Klick öffnet `/account`.
2. iPhone: App auf den Home-Bildschirm legen, von dort öffnen, aktivieren → „Test senden“ → Mitteilung erscheint auch bei gesperrtem Telefon.
3. Probebestellung mit einem Kundenkonto: beide Geräte bekommen „Neue Bestellung – LG-… · Firma · Betrag“; Antippen öffnet die Bestellung; Reiter „Bestellungen“ zeigt die Zahl.
4. Schalter „Neue Bestellung“ am Mac aus, nächste Probebestellung: nur das iPhone meldet.
5. Probe-Registrierung unter `/register`: „Neuer Kunde – Firma · Ort“ auf den Geräten mit eingeschaltetem Schalter.
6. „Entfernen“ am Mac: kein Push mehr dorthin; erneut aktivieren funktioniert.
7. Admin legt selbst eine Bestellung an (Kasse/Rechnung aus Katalog): keine Mitteilung.

---

## Spec-Abdeckung (Selbstprüfung)

| Spec-Abschnitt | Task |
|----------------|------|
| 1 Daten, RLS, Empfängerfilter | 3 (Tabelle, RLS), 2 (`waehleEmpfaenger`) |
| 2 Texte, Versand, Auslöser, Actions, Umgebung | 1, 4, 5 |
| 3 Service Worker, Manifest, Icons, Proxy, Einstellungsseite, PushSync | 6, 7 |
| 4 Selbstheilung, Test-Knopf, Zähler, mehrere Geräte | 4 (`istAboTot`, `testeGeraet`), 7 (`PushSync`, Zähler, Geräteliste) |
| Fehlerbehandlung (Tabelle) | 4 (`konfiguriert`, `sendeAnGeraet`), 7 (Zustände 1 und 5) |
| Tests | 1, 2; Abnahme 8 |
| Offener Punkt Bestellstatus | geklärt: `create_order` setzt `'submitted'` (Migration 029) → Zähler in Task 7 |
| Offener Punkt Ort Neukunde | `billing_city` aus dem Registrierungsformular → Task 5 |
| Abweichung zur Spec | `VAPID_SUBJECT` ist die https-Adresse des Shops statt einer Mailadresse (Task 4, Step 4 passt die Spec an) |
