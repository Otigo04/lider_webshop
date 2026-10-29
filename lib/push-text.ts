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
