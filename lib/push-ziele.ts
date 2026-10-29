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

/** Anzeigename eines Geräts aus dem User-Agent: „iPhone", „Mac · Safari" … */
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
