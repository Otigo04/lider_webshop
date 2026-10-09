/**
 * Rücksprung aus dem Artikel in die Artikelliste.
 *
 * Wer Artikel nacheinander abarbeitet, soll nach dem Speichern dort
 * weitermachen, wo er war: gleiche Suche, gleiche Filter, gleiche Stelle.
 * Gemerkt wird in sessionStorage (pro Tab, kein Datenbankzugriff). Jeder
 * Zugriff steht in try/catch: ohne Storage (privates Fenster, gesperrt)
 * läuft alles wie vorher, man landet dann auf der frischen Liste.
 */

const LISTE = "/admin/products";
const SCHLUESSEL = "artikelliste:merk";
const FLAG = "artikelliste:wiederherstellen";

export interface ListenMerk {
  adresse: string;
  hoehe: number;
  id: string | null;
}

/**
 * Nur die Liste selbst (mit beliebiger Suche) ist ein erlaubtes Ziel. Der
 * Wert kommt aus dem Storage, also von außen veränderbar – ein Link auf eine
 * fremde Adresse wäre eine offene Weiterleitung.
 */
export function sichereListenAdresse(adresse: unknown): string {
  if (typeof adresse !== "string") return LISTE;
  if (adresse === LISTE) return adresse;
  return adresse.startsWith(`${LISTE}?`) ? adresse : LISTE;
}

export function merkeListe(merk: ListenMerk): void {
  try {
    sessionStorage.setItem(SCHLUESSEL, JSON.stringify(merk));
  } catch {
    /* ohne Storage bleibt es beim Verhalten von vorher */
  }
}

export function holeListe(): ListenMerk | null {
  try {
    const roh = sessionStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const wert = JSON.parse(roh) as Partial<ListenMerk>;
    return {
      adresse: sichereListenAdresse(wert.adresse),
      hoehe: typeof wert.hoehe === "number" ? wert.hoehe : 0,
      id: typeof wert.id === "string" ? wert.id : null,
    };
  } catch {
    return null;
  }
}

/** Wohin „zurück zur Liste" führt: die gemerkte Adresse oder die frische Liste. */
export function listenZiel(): string {
  return holeListe()?.adresse ?? LISTE;
}

/** Die nächste Liste soll die gemerkte Stelle ansteuern (einmalig). */
export function merkeWiederherstellen(): void {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* s. o. */
  }
}

/** Liest und löscht das Flag. true = diesmal wiederherstellen. */
export function nimmWiederherstellen(): boolean {
  try {
    const gesetzt = sessionStorage.getItem(FLAG) === "1";
    sessionStorage.removeItem(FLAG);
    return gesetzt;
  } catch {
    return false;
  }
}
