"use client";

import { useEffect } from "react";
import { abonniere } from "@/lib/actions/push";
import { aboDaten, istAbgemeldet, meldeAn, pushUnterstuetzt } from "@/lib/push-client";

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
    // Wer dieses Gerät bewusst entfernt hat, soll nicht stillschweigend
    // zurückkehren – die Erlaubnis im Browser bleibt ja bestehen.
    if (istAbgemeldet()) return;
    (async () => {
      const abo = await meldeAn();
      await abonniere(aboDaten(abo));
    })().catch((err) => console.warn("[push] Abgleich fehlgeschlagen:", err));
  }, []);

  return null;
}
