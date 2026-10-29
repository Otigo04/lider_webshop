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
 * iPhone/iPad ohne Installation geht vor „nicht unterstützt": im Safari-Tab
 * fehlt PushManager, die richtige Auskunft ist aber „zum Home-Bildschirm
 * hinzufügen", nicht „geht nicht".
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

/**
 * Merker „auf diesem Gerät abgemeldet". Ohne ihn würde `PushSync` ein per
 * „Entfernen" gelöschtes Gerät beim nächsten Besuch der Verwaltung sofort
 * wieder anmelden, weil die Browser-Erlaubnis bestehen bleibt. Der Merker lebt
 * nur in diesem Browser und wird erst durch den Klick auf „aktivieren"
 * gelöscht. localStorage kann fehlen oder werfen (privater Modus, SSR, Node) –
 * dann gilt das Gerät als nicht abgemeldet.
 */
const ABMELDE_SCHLUESSEL = "lider-push-abgemeldet";

export function merkeAbmeldung(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(ABMELDE_SCHLUESSEL, "1");
  } catch {
    /* Ohne Speicher bleibt nur der Server-Stand; mehr geht nicht. */
  }
}

export function loescheAbmeldung(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(ABMELDE_SCHLUESSEL);
  } catch {
    /* Siehe merkeAbmeldung. */
  }
}

export function istAbgemeldet(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(ABMELDE_SCHLUESSEL) === "1";
  } catch {
    return false;
  }
}
